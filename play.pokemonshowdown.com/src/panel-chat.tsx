/**
 * Chat panel
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 */

import preact from "../js/lib/preact";
import type { PSSubscription } from "./client-core";
import { PS, PSRoom, type RoomOptions, type RoomID, type Team, Config } from "./client-main";
import { PSView, PSPanelWrapper, PSRoomPanel } from "./panels";
import { TeamForm } from "./panel-mainmenu";
import { BattleLog } from "./battle-log";
import type { Battle } from "./battle";
import { MiniEdit } from "./miniedit";
import { Dex, PSUtils, toID, type ID } from "./battle-dex";
import { BattleTextParser, type Args } from "./battle-text-parser";
import { PSLoginServer } from "./client-connection";
import type { BattleRoom } from "./panel-battle";
import { BattleChoiceBuilder } from "./battle-choices";
import { ChatTournament, TournamentBox } from "./panel-chat-tournament";

class ChatRoom extends PSRoom {
	readonly classType: 'chat' | 'battle' = 'chat';
	users: {[userid: string]: string} = {};
	userCount = 0;
	readonly canConnect = true;

	// PM-only properties
	pmTarget: string | null = null;
	challengeMenuOpen = false;
	initialSlash = false;
	challenging: Challenge | null = null;
	/** True after challenge send/accept before server acknowledgement */
	teamSent: string | null = null;
	challenged: Challenge | null = null;
	/** n.b. this will be null outside of battle rooms */
	battle: Battle | null = null;
	log: BattleLog | null = null;
	tour: ChatTournament | null = null;
	lastMessage: Args | null = null;
	lastViewedTime: number | null = null;

	joinLeave: { join: string[], leave: string[], messageId: string } | null = null;
	/** in order from least to most recent */
	userActivity: ID[] = [];
	timeOffset = 0;
	static highlightRegExp: Record<string, RegExp | null> | null = null;

	constructor(options: RoomOptions) {
		super(options);
		if (options.pmTarget) this.pmTarget = options.pmTarget as string;
		if (options.challengeMenuOpen) this.challengeMenuOpen = true;
		this.updateTarget(true);
		this.connect();
	}
	connect() {
		if (!this.connected) {
			if (!this.pmTarget) PS.send(`|/join ${this.id}`);
			this.connected = true;
			this.connectWhenLoggedIn = false;
		}
	}
	override receiveLine(args: Args) {
		switch (args[0]) {
		case 'users':
			const usernames = args[1].split(',');
			const count = parseInt(usernames.shift()!, 10);
			this.setUsers(count, usernames);
			return;

		case 'join': case 'j': case 'J':
			this.addUser(args[1]);
			this.handleJoinLeave("join", args[1], args[0] === "J");
			return true;

		case 'leave': case 'l': case 'L':
			this.removeUser(args[1]);
			this.handleJoinLeave("leave", args[1], args[0] === "L");
			return true;

		case 'name': case 'n': case 'N':
			this.renameUser(args[1], args[2]);
			break;

		case 'tournament': case 'tournaments':
			this.tour ||= new ChatTournament(this);
			this.tour.receiveLine(args);
			return;

		case 'noinit':
			if (this.battle && args[1] === 'joinfailed') {
				this.receiveLine(['bigerror', args[2]]);
				this.receiveLine(['html',
					`<div class="broadcast-red pad"><p class="buttonbar"><button class="button" data-cmd="/close"><strong>Close</strong></button></p></div>`,
				]);
			} else if (this.battle) {
				// check the Replays database
				(this as any as BattleRoom).loadReplay();
			} else {
				const message = args[2] ? BattleLog.escapeHTML(args[2]) : `Chatroom "${BattleLog.escapeHTML(this.title)}" not found`;
				this.receiveLine(['html',
					`<div class="broadcast-red pad"><h3>${message}</h3><p class="buttonbar"><button class="button" data-cmd="/close"><strong>Close</strong></button></p></div>`,
				]);
			}
			return;
		case 'expire':
			this.connected = 'expired';
			this.receiveLine(['', `This room has expired (you can't chat in it anymore)`]);
			return;

		case 'chat': case 'c':
			if (`${args[2]} `.startsWith('/challenge ')) {
				this.updateChallenge(args[1], args[2].slice(11));
				return;
			} else if (args[2].startsWith('/warn ')) {
				const reason = args[2].replace('/warn ', '');
				PS.join(`rules-warn` as RoomID, {
					args: {
						type: 'warn',
						message: reason?.trim() || undefined,
					},
					parentElem: null,
				});
				return;
			}
			// falls through
		case 'c:':
			if (args[0] === 'c:') PS.lastMessageTime = args[1];
			this.lastMessage = args;
			this.joinLeave = null;
			const name = args[args[0] === 'c:' ? 2 : 1];
			this.markUserActive(name);
			if (this.tour) this.tour.joinLeave = null;
			if (this.id.startsWith("dm-")) {
				const fromUser = args[args[0] === 'c:' ? 2 : 1];
				if (toID(fromUser) === PS.user.userid) break;
				const message = args[args[0] === 'c:' ? 3 : 2];
				const noNotify = this.log?.parseChatMessage(message, name, args[1])?.[2];
				const isIgnored = PS.prefs.ignore?.[toID(fromUser)];
				if (!noNotify && !isIgnored) {
					let textContent = message;
					if (/^\/(log|raw|html|uhtml|uhtmlchange) /.test(message)) {
						textContent = message.split(' ').slice(1).join(' ')
							.replace(/<[^>]*?>/g, '');
					}
					this.notify({
						title: `${this.title}`,
						body: textContent,
					});
				} else if (noNotify === 'subtle') {
					this.subtleNotify();
				}
			} else {
				this.pmTarget = id1;
			}
			break;
		case ':':
			this.timeOffset = Math.trunc(Date.now() / 1000) - (parseInt(args[1], 10) || 0);
			PS.lastMessageTime = args[1];
			break;
		}
	}
	override handleReconnect(msg: string): boolean | void {
		if (this.battle) {
			this.battle.reset();
			this.battle.stepQueue = [];
			return false;
		} else {
			let lines = msg.split('\n');

			// cut off starting lines until we get to PS.lastMessage timestamp
			// then cut off roomintro from the end
			let cutOffStart = 0;
			let cutOffEnd = lines.length;
			const cutOffTime = PS.connection?.lastMessageTimeBeforeReconnect || parseInt(PS.lastMessageTime);
			const cutOffExactLine = this.lastMessage ? '|' + this.lastMessage?.join('|') : '';
			let reconnectMessage = '|raw|<div class="infobox">You reconnected.</div>';
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].startsWith('|users|')) {
					this.add(lines[i]);
				}
				if (lines[i] === cutOffExactLine) {
					cutOffStart = i + 1;
				} else if (lines[i].startsWith(`|c:|`)) {
					const time = parseInt(lines[i].split('|')[2] || '');
					if (time < cutOffTime) cutOffStart = i;
				}
				if (lines[i].startsWith('|raw|<div class="infobox"> You joined ')) {
					const timestamp = BattleLog.renderTimestamp(Date.now() / 1000, PS.prefs.timestamps?.chatrooms);
					reconnectMessage = `|raw|<div class="infobox">${timestamp}You reconnected to ${lines[i].slice(38)}`;
					cutOffEnd = i;
					if (!lines[i - 1]) cutOffEnd = i - 1;
				}
			}
			console.log(`Reconnection log splice: (cutoff: ${cutOffTime})`);
			console.log([
				...lines.slice(0, cutOffStart),
				'====================',
				...lines.slice(cutOffStart, cutOffEnd),
				'====================',
				...lines.slice(cutOffEnd),
			].join('\n'));
			lines = lines.slice(cutOffStart, cutOffEnd);

			if (lines.length) {
				const timestamp = BattleLog.renderTimestamp(cutOffTime, PS.prefs.timestamps?.chatrooms);
				this.receiveLine([`raw`, `<div class="infobox">${timestamp}You disconnected.</div>`]);
				for (const line of lines) this.receiveLine(BattleTextParser.parseLine(line));
				this.receiveLine(BattleTextParser.parseLine(reconnectMessage));
			}
			this.update(null);
			return true;
		}
	}
	updateTarget(name?: string | null) {
		const selfWithGroup = `${PS.user.group || ' '}${PS.user.name}`;
		if (this.id === 'dm-') {
			this.pmTarget = selfWithGroup;
			this.setUsers(1, [selfWithGroup]);
			this.title = `Console`;
		} else if (this.id.startsWith('dm-')) {
			const id = this.id.slice(3);
			if (toID(name) !== id) name = null;
			name ||= this.pmTarget || id;
			if (/[A-Za-z0-9]/.test(name.charAt(0))) name = ` ${name}`;
			const nameWithGroup = name;
			name = name.slice(1);
			this.pmTarget = name;
			if (!PS.user.userid) {
				this.setUsers(1, [nameWithGroup]);
			} else {
				this.setUsers(2, [nameWithGroup, selfWithGroup]);
			}
			this.title = `[DM] ${nameWithGroup.trim()}`;
		}
	}
	static getHighlight(message: string, roomid: string) {
		let highlights = PS.prefs.highlights || {};
		if (Array.isArray(highlights)) {
			highlights = { global: highlights };
			// Migrate from the old highlight system
			PS.prefs.set('highlights', highlights);
		}
		if (!PS.prefs.noselfhighlight && PS.user.nameRegExp) {
			if (PS.user.nameRegExp?.test(message)) return true;
		}
		if (!this.highlightRegExp) {
			try {
				this.updateHighlightRegExp(highlights);
			} catch {
				// If the expression above is not a regexp, we'll get here.
				// Don't throw an exception because that would prevent the chat
				// message from showing up, or, when the lobby is initialising,
				// it will prevent the initialisation from completing.
				return false;
			}
		}
		const id = PS.server.id + '#' + roomid;
		const globalHighlightsRegExp = this.highlightRegExp?.['global'];
		const roomHighlightsRegExp = this.highlightRegExp?.[id];
		return (((globalHighlightsRegExp?.test(message)) || (roomHighlightsRegExp?.test(message))));
	}
	static updateHighlightRegExp(highlights: Record<string, string[]>) {
		// Enforce boundary for match sides, if a letter on match side is
		// a word character. For example, regular expression "a" matches
		// "a", but not "abc", while regular expression "!" matches
		// "!" and "!abc".
		this.highlightRegExp = {};
		for (let i in highlights) {
			if (!highlights[i].length) {
				this.highlightRegExp[i] = null;
				continue;
			}
			this.highlightRegExp[i] = new RegExp('(?:\\b|(?!\\w))(?:' + highlights[i].join('|') + ')(?:\\b|(?!\\w))', 'i');
		}
	}
	handleHighlight = (args: Args) => {
		let name;
		let message;
		let serverTime = 0;
		if (args[0] === 'c:') {
			serverTime = parseInt(args[1]);
			name = args[2];
			message = args[3];
		} else {
			name = args[1];
			message = args[2];
		}
		if (toID(name) === PS.user.userid) return false;
		if (message.startsWith(`/raw `) || message.startsWith(`/uhtml`) || message.startsWith(`/uhtmlchange`)) {
			return false;
		}

		const lastMessageDates = Dex.prefs('logtimes') || (PS.prefs.set('logtimes', {}), Dex.prefs('logtimes'));
		if (!lastMessageDates[PS.server.id]) lastMessageDates[PS.server.id] = {};
		const lastMessageDate = lastMessageDates[PS.server.id][this.id] || 0;
		// because the time offset to the server can vary slightly, subtract it to not have it affect comparisons between dates
		const time = serverTime - (this.timeOffset || 0);
		if (PS.isVisiblePanel(this)) {
			this.lastViewedTime = null;
			lastMessageDates[PS.server.id][this.id] = time;
			PS.prefs.set('logtimes', lastMessageDates);
		} else {
			// To be saved on focus
			const lastViewedTime = this.lastViewedTime || 0;
			if (lastViewedTime < time) this.lastViewedTime = time;
		}
		if (ChatRoom.getHighlight(message, this.id)) {
			const mayNotify = time > lastMessageDate;
			if (mayNotify) this.notify({
				title: `Mentioned by ${name} in ${this.id}`,
				body: `"${message}"`,
				id: 'highlight',
			});
			return true;
		} case 'chall': case 'challenge': {
			if (target) {
				PS.join(`challenge-${toID(target)}` as RoomID);
				return true;
			}
			this.openChallenge();
			return true;
		} case 'cchall': case 'cancelchallenge': {
			this.cancelChallenge();
			return true;
		} case 'reject': {
			this.challengedFormat = null;
			this.update(null);
			this.sendDirect(`/reject ${target}`);
		},
		'clear'() {
			this.log?.reset();
			this.update(null);
		},
		'togglemessages'(target) {
			if (this.pmTarget ||
				this.type !== 'chat') return this.errorReply('This command can only be used in proper chat rooms.');
			if (this.log) {
				const userid = toID(target);
				const classStart = 'revealed chat chatmessage-' + userid;
				const nodes: HTMLElement[] = [];
				let isHidden = true;
				for (const node of this.log.innerElem.childNodes as any as HTMLElement[]) {
					if (node.className && (node.className + ' ').startsWith(classStart)) {
						nodes.push(node);
					}
				}
				if (this.log.preemptElem) {
					for (const node of this.log.preemptElem.childNodes as any as HTMLElement[]) {
						if (node.className && (node.className + ' ').startsWith(classStart)) {
							nodes.push(node);
						}
					}
				}
				isHidden = nodes[0].style.display === 'none';
				nodes.every(node => {
					node.style.display = isHidden ? '' : 'none';
					return true;
				});
				isHidden = !isHidden;
				const toggleButtons = this.log.innerElem.querySelectorAll(`button[name="toggleMessages"][value="${userid}"]`);
				for (const button of toggleButtons) {
					button.innerHTML = isHidden ?
						`<small>(${nodes.length} line${nodes.length > 1 ? 's' : ''} from ${userid} hidden)</small>` :
						`<small>(Hide ${nodes.length} line${nodes.length > 1 ? 's' : ''} from ${userid})</small>`;
				}
			}
		},
		'rank,ranking,rating,ladder'(target) {
			let arg = target;
			if (!arg) {
				arg = PS.user.userid;
			}
			if (this.battle && !arg.includes(',')) {
				arg += ", " + this.id.split('-')[1];
			}

			const targets = arg.split(',');
			let formatTargeting = false;
			const formats: { [key: string]: number } = {};
			const gens: { [key: string]: number } = {};
			for (let i = 1, len = targets.length; i < len; i++) {
				targets[i] = $.trim(targets[i]);
				if (targets[i].length === 4 && targets[i].startsWith('gen')) {
					gens[targets[i]] = 1;
				} else {
					formats[toID(targets[i])] = 1;
				}
				formatTargeting = true;
			}

			PSLoginServer.query("ladderget", {
				user: targets[0],
			}).then(data => {
				if (!data || !Array.isArray(data)) return this.add(`|error|Error: corrupted ranking data`);
				let buffer = `<div class="ladder"><table><tr><td colspan="9">User: <strong>${toID(targets[0])}</strong></td></tr>`;
				if (!data.length) {
					buffer += '<tr><td colspan="9"><em>This user has not played any ladder games yet.</em></td></tr>';
					buffer += '</table></div>';
					return this.add(`|html|${buffer}`);
				}
				buffer += '<tr><th>Format</th><th><abbr title="Elo rating">Elo</abbr></th><th><abbr title="user\'s percentage chance of winning a random battle (aka GLIXARE)">GXE</abbr></th><th><abbr title="Glicko-1 rating: rating &#177; deviation">Glicko-1</abbr></th><th>COIL</th><th>W</th><th>L</th><th>Total</th>';
				let suspect = false;
				for (const item of data) {
					if ('suspect' in item) suspect = true;
				}
				if (suspect) buffer += '<th>Suspect reqs possible?</th>';
				buffer += '</tr>';
				const hiddenFormats = [];
				for (const row of data) {
					if (!row) return this.add(`|error|Error: corrupted ranking data`);
					const formatId = toID(row.formatid);
					const matchesTarget = (
						formats[formatId] ||
						gens[formatId.slice(0, 4)] ||
						(gens['gen6'] && !formatId.startsWith('gen'))
					);
					if (matchesTarget || (!formatTargeting && row.elo >= 1001 && (row.w + row.l + row.t > 0))) {
						buffer += '<tr>';
					} else {
						buffer += '<tr class="hidden">';
						hiddenFormats.push(window.BattleLog.escapeFormat(formatId, true));
					}

					// Validate all the numerical data
					for (const value of [row.elo, row.rpr, row.rprd, row.gxe, row.w, row.l, row.t]) {
						if (typeof value !== 'number' && typeof value !== 'string') {
							return this.add(`|error|Error: corrupted ranking data`);
						}
					}

					buffer += `<td> ${BattleLog.escapeHTML(BattleLog.formatName(formatId, true))} </td><td><strong>${Math.round(row.elo)}</strong></td>`;
					if (row.rprd > 100) {
						// High rating deviation. Provisional rating.
						buffer += `<td>&ndash;</td>`;
						buffer += `<td><span style="color:#888"><em>${Math.round(row.rpr)} <small> &#177; ${Math.round(row.rprd)} </small></em> <small>(provisional)</small></span></td>`;
					} else {
						buffer += `<td>${Math.trunc(row.gxe)}<small>.${row.gxe.toFixed(1).slice(-1)}%</small></td>`;
						buffer += `<td><em>${Math.round(row.rpr)} <small> &#177; ${Math.round(row.rprd)}</small></em></td>`;
					}
					const N = parseInt(row.w, 10) + parseInt(row.l, 10) + parseInt(row.t, 10);
					const COIL_B = undefined;

					// Uncomment this after LadderRoom logic is implemented
					// COIL_B = LadderRoom?.COIL_B[formatId];

					if (COIL_B) {
						buffer += `<td>${Math.round(40.0 * parseFloat(row.gxe) * 2.0 ** (-COIL_B / N))}</td>`;
					} else {
						buffer += '<td>&mdash;</td>';
					}
					buffer += `<td> ${row.w} </td><td> ${row.l} </td><td> ${N} </td>`;
					if (suspect) {
						if (typeof row.suspect === 'undefined') {
							buffer += '<td>&mdash;</td>';
						} else {
							buffer += '<td>';
							buffer += (row.suspect ? "Yes" : "No");
							buffer += '</td>';
						}
					}
					buffer += '</tr>';
				}
				if (hiddenFormats.length) {
					if (hiddenFormats.length === data.length) {
						if (formatTargeting) {
							const formatsText = Object.keys(gens).concat(Object.keys(formats)).join(', ');
							buffer += `<tr class="no-matches"><td colspan="8">` +
								BattleLog.html`<em>This user has not played any ladder games that match ${formatsText}.</em></td></tr>`;
						} else {
							buffer += `<tr class="no-matches"><td colspan="8"><em>This user has no notable ladder activity.</em></td></tr>`;
						}
					}
					buffer += `<tr><td colspan="8"><button class="button" name="showOtherFormats">` +
						`Show ${hiddenFormats.length} hidden format${hiddenFormats.length === 1 ? '' : 's'}</button></td></tr>`;
				}
				let userid = toID(targets[0]);
				let registered = PS.user.registered;
				if (registered && PS.user.userid === userid) {
					buffer += `<tr><td colspan="8" style="text-align:right"><a href="//${Config.routes.users}/${userid}">Reset W/L</a></tr></td>`;
				}
				buffer += '</table></div>';
				this.add(`|html|${buffer}`);
			});
		},

		// battle-specific commands
		// ------------------------
		'play'() {
			if (!this.battle) return this.add('|error|You are not in a battle');
			if (this.battle.atQueueEnd) {
				if (this.battle.ended) this.battle.isReplay = true;
				this.battle.reset();
			}
			this.battle.play();
			this.update(null);
		},
		'pause'() {
			if (!this.battle) return this.add('|error|You are not in a battle');
			this.battle.pause();
			this.update(null);
		},
		'ffto,fastfowardto'(target, cmd, parentElem) {
			if (!this.battle) return this.add('|error|You are not in a battle');
			if (!target) {
				PS.prompt("Turn number?", {
					defaultValue: `${this.battle.turn}`,
					type: 'numeric',
					okButton: 'Go',
					parentElem,
				}).then(turnNum => {
					if (turnNum?.trim()) this.send(`/ffto ${turnNum}`, parentElem);
				});
				return;
			}

			let turnNum = Number(target);
			if (target.startsWith('+') || turnNum < 0) {
				turnNum += this.battle.seeking ?? this.battle.turn;
				if (turnNum < 0) turnNum = 0;
			} else if (target === 'end') {
				turnNum = Infinity;
			}
			if (isNaN(turnNum)) {
				this.errorReply(`Invalid turn number: ${target}`);
				return;
			}
			if (this.battle.hardcoreMode) {
				this.errorReply(`Turn navigation is disabled in hardcore mode.`);
				return;
			}
			this.battle.seekTurn(turnNum);
			this.update(null);
		},
		'switchsides'() {
			if (!this.battle) return this.add('|error|You are not in a battle');
			this.battle.switchViewpoint();
		},
		'cancel,undo'() {
			if (!this.battle) return this.send('/cancelchallenge');

			const room = this as any as BattleRoom;
			if (!room.choices || !room.request) {
				this.receiveLine([`error`, `/choose - You are not a player in this battle`]);
				return;
			}
			if (room.choices.isDone() || room.choices.isEmpty()) {
				// we _could_ check choices.noCancel, but the server will check anyway
				this.sendDirect('/undo');
			}
			room.choices = new BattleChoiceBuilder(room.request);
			this.update(null);
		},
		'move,switch,team,pass,shift,choose'(target, cmd) {
			if (!this.battle) return this.add('|error|You are not in a battle');
			const room = this as any as BattleRoom;
			if (!room.choices) {
				this.receiveLine([`error`, `/choose - You are not a player in this battle`]);
				return;
			}
			if (cmd !== 'choose') target = `${cmd} ${target}`;
			if (target === 'choose auto' || target === 'choose default') {
				this.sendDirect('/choose default');
				return;
			}
			const possibleError = room.choices.addChoice(target);
			if (possibleError) {
				this.errorReply(possibleError);
				return;
			}
			if (room.choices.isDone()) this.sendDirect(`/choose ${room.choices.toString()}`);
			this.update(null);
		},
	});
	openChallenge() {
		if (!this.pmTarget) {
			this.receiveLine([`error`, `Can only be used in a PM.`]);
			return;
		}
		this.challengeMenuOpen = true;
		this.update(null);
	}
	cancelChallenge() {
		if (!this.pmTarget) {
			this.receiveLine([`error`, `Can only be used in a PM.`]);
			return;
		}
		if (this.challengingFormat) {
			this.send('/cancelchallenge', true);
			this.challengingFormat = null;
			this.challengeMenuOpen = true;
		} else {
			this.challengeMenuOpen = false;
		}
		this.update(null);
	}
	send(line: string, direct?: boolean) {
		this.updateTarget();
		if (!direct && !line) return;
		if (!direct && this.handleMessage(line)) return;
		if (this.pmTarget) {
			PS.send(`|/pm ${this.pmTarget}, ${line}`);
			return;
		}
		super.send(line, true);
	}
	setUsers(count: number, usernames: string[]) {
		this.userCount = count;
		this.users = {};
		for (const username of usernames) {
			const userid = toID(username);
			this.users[userid] = username;
		}
		this.update(null);
	}
	addUser(username: string) {
		const userid = toID(username);
		if (!(userid in this.users)) this.userCount++;
		this.users[userid] = username;
		this.update(null);
	}
	removeUser(username: string, noUpdate?: boolean) {
		const userid = toID(username);
		if (userid in this.users) {
			this.userCount--;
			delete this.users[userid];
		}
		if (!noUpdate) this.update(null);
	}
	renameUser(username: string, oldUsername: string) {
		this.removeUser(oldUsername, true);
		this.addUser(username);
		this.update(null);
	}

	handleJoinLeave(action: 'join' | 'leave', name: string, silent: boolean) {
		const showjoins = PS.prefs.showjoins?.[PS.server.id];
		if (!(showjoins?.[this.id] ?? showjoins?.['global'] ?? !silent)) return;

		this.joinLeave ||= {
			join: [],
			leave: [],
			messageId: `joinleave-${Date.now()}`,
		};
		const user = BattleTextParser.parseNameParts(name);
		const formattedName = user.group + user.name;
		if (action === 'join' && this.joinLeave['leave'].includes(formattedName)) {
			this.joinLeave['leave'].splice(this.joinLeave['leave'].indexOf(formattedName), 1);
		} else if (action === 'leave' && this.joinLeave['join'].includes(formattedName)) {
			this.joinLeave['join'].splice(this.joinLeave['join'].indexOf(formattedName), 1);
		} else {
			this.joinLeave[action].push(formattedName);
		}

		let message = this.formatJoinLeave(this.joinLeave['join'], 'joined');
		if (this.joinLeave['join'].length && this.joinLeave['leave'].length) message += '; ';
		message += this.formatJoinLeave(this.joinLeave['leave'], 'left');

		this.add(`|uhtml|${this.joinLeave.messageId}|<small class="gray">${message}</small>`);
	}

	formatJoinLeave(preList: string[], action: 'joined' | 'left') {
		if (!preList.length) return '';

		let message = '';
		let list: string[] = [];
		let named: { [key: string]: boolean } = {};
		for (let item of preList) {
			if (!named[item]) list.push(item);
			named[item] = true;
		}
		for (let j = 0; j < list.length; j++) {
			if (j >= 5) {
				message += `, and ${(list.length - 5)} others`;
				break;
			}
			if (j > 0) {
				if (j === 1 && list.length === 2) {
					message += ' and ';
				} else if (j === list.length - 1) {
					message += ', and ';
				} else {
					message += ', ';
				}
			}
			message += BattleLog.escapeHTML(list[j]);
		}
		return `${message} ${action}`;
	}

	override destroy() {
		if (this.battle) {
			// since battle is defined here, we might as well deallocate it here
			this.battle.destroy();
		} else {
			this.log?.destroy();
		}
		super.destroy();
	}
}

export class CopyableURLBox extends preact.Component<{ url: string }> {
	copy = () => {
		const input = this.base!.children[0] as HTMLInputElement;
		input.select();
		document.execCommand('copy');
	};
	override render() {
		return <div>
			<input
				type="text" class="textbox" readOnly size={45} value={this.props.url}
				style="field-sizing:content"
			/> {}
			<button class="button" onClick={this.copy}>Copy</button> {}
			<a href={this.props.url} target="_blank" class="no-panel-intercept">
				<button class="button">Visit</button>
			</a>
		</div>;
	}
}

interface UserAutoCompleteCandidate {
	type: "user";
	userid: string;
	prefixIndex: number;
}

interface CmdAutoCompleteCandidate {
	type: "command";
	command: string;
}

export type AutoCompleteCandidate = UserAutoCompleteCandidate | CmdAutoCompleteCandidate;

export class ChatTextEntry extends preact.Component<{
	room: ChatRoom, onMessage: (msg: string, elem: HTMLElement) => void, onKey: (e: KeyboardEvent) => boolean,
	left?: number, tinyLayout?: boolean,
}> {
	subscription: PSSubscription | null = null;
	textbox: HTMLTextAreaElement = null!;
	miniedit: MiniEdit | null = null;
	history: string[] = [];
	historyIndex = 0;
	tabComplete: {
		candidates: AutoCompleteCandidate[],
		candidateIndex: number,
		/** the text left of the cursor before tab completing */
		prefix: string,
		/** the text left of the cursor after tab completing */
		cursor: string,
	} | null = null;
	override componentDidMount() {
		this.subscription = PS.user.subscribe(() => {
			this.forceUpdate();
		});
		const textbox = this.base!.children[0].children[1] as HTMLElement;
		if (textbox.tagName === 'TEXTAREA') this.textbox = textbox as HTMLTextAreaElement;
		this.miniedit = new MiniEdit(textbox, {
			setContent: text => {
				textbox.innerHTML = formatText(text, false, false, true) + '\n';
			},
			onKeyDown: this.onKeyDown,
		});
		if (this.base) this.update();
	}
	override componentWillUnmount() {
		if (this.subscription) {
			this.subscription.unsubscribe();
			this.subscription = null;
		}
	}
	update = () => {
		// const textbox = this.textbox;
		// textbox.style.height = `12px`;
		// const newHeight = Math.min(Math.max(textbox.scrollHeight - 2, 16), 600);
		// textbox.style.height = `${newHeight}px`;
	};
	focusIfNoSelection = (e: Event) => {
		if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
		const selection = window.getSelection()!;
		if (selection.type === 'Range') return;
		const elem = this.base!.children[0].children[1] as HTMLTextAreaElement;
		elem.focus();
	};
	submit() {
		this.props.onMessage(this.getValue());
		this.historyPush(this.getValue());
		this.setValue('');
		this.update();
		return true;
	}
	onKeyDown = (e: KeyboardEvent) => {
		if (this.handleKey(e) || this.props.onKey(e)) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	};
	getValue() {
		return this.miniedit ? this.miniedit.getValue() : this.textbox.value;
	}
	setValue(value: string, selection?: {start: number, end: number}) {
		if (this.miniedit) {
			this.miniedit.setValue(value, selection);
		} else {
			this.textbox.value = value;
			if (selection) this.textbox.setSelectionRange?.(selection.start, selection.end);
		}
	}
	historyUp() {
		if (this.historyIndex === 0) return false;
		const line = this.getValue();
		if (line !== '') this.history[this.historyIndex] = line;
		this.setValue(this.history[--this.historyIndex]);
		return true;
	}
	historyDown() {
		const line = this.getValue();
		if (line !== '') this.history[this.historyIndex] = line;
		if (this.historyIndex === this.history.length) {
			if (!line) return false;
			this.setValue('');
		} else if (++this.historyIndex === this.history.length) {
			this.setValue('');
		} else {
			this.setValue(this.history[this.historyIndex]);
		}
		return true;
	}
	historyPush(line: string) {
		const duplicateIndex = this.history.lastIndexOf(line);
		if (duplicateIndex >= 0) this.history.splice(duplicateIndex, 1);
		if (this.history.length > 100) this.history.splice(0, 20);
		this.history.push(line);
		this.historyIndex = this.history.length;
	}
	handleKey(ev: KeyboardEvent) {
		const cmdKey = ((ev.metaKey ? 1 : 0) + (ev.ctrlKey ? 1 : 0) === 1) && !ev.altKey && !ev.shiftKey;
		const anyModifier = ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey;
		if (ev.keyCode === 13 && !ev.shiftKey) { // Enter key
			return this.submit();
		} else if (ev.keyCode === 13 && this.miniedit) { // enter
			this.miniedit.replaceSelection('\n');
			return true;
		} else if (ev.keyCode === 73 && cmdKey) { // Ctrl + I key
			return this.toggleFormatChar('_');
		} else if (ev.keyCode === 66 && cmdKey) { // Ctrl + B key
			return this.toggleFormatChar('*');
		} else if (ev.keyCode === 192 && cmdKey) { // Ctrl + ` key
			return this.toggleFormatChar('`');
		// } else if (e.keyCode === 9 && !e.ctrlKey) { // Tab key
		// 	const reverse = !!e.shiftKey; // Shift+Tab reverses direction
		// 	return this.handleTabComplete(this.$chatbox, reverse);
		} else if (ev.keyCode === 38 && !ev.shiftKey && !ev.altKey) { // Up key
			return this.historyUp();
		} else if (ev.keyCode === 40 && !ev.shiftKey && !ev.altKey) { // Down key
			return this.historyDown();
		// } else if (app.user.lastPM && (textbox.value === '/reply' || textbox.value === '/r' || textbox.value === '/R') && e.keyCode === 32) { // '/reply ' is being written
		// 	var val = '/pm ' + app.user.lastPM + ', ';
		// 	textbox.value = val;
		// 	textbox.setSelectionRange(val.length, val.length);
		// 	return true;
		}
		return false;
	}
	// TODO - add support for commands tabcomplete
	handleTabComplete(reverse: boolean): boolean {
		// Don't tab complete at the start of the text box.
		let { value, start, end } = this.getSelection();
		if (start !== end || end === 0) return false;

		const users = this.props.room.users;
		let prefix = value.slice(0, end);
		if (this.tabComplete && prefix === this.tabComplete.cursor) {
			// The user is cycling through the candidate names.
			if (reverse) {
				this.tabComplete.candidateIndex--;
				if (this.tabComplete.candidateIndex < 0) {
					this.tabComplete.candidateIndex = this.tabComplete.candidates.length - 1;
				}
			} else {
				this.tabComplete.candidateIndex++;
				if (this.tabComplete.candidateIndex >= this.tabComplete.candidates.length) {
					this.tabComplete.candidateIndex = 0;
				}
			}
		} else if (!value || reverse) {
			// not tab completing - let them focus things
			return false;
		} else {
			// This is a new tab completion.
			// There needs to be non-whitespace to the left of the cursor.
			// no command prefixes either, we're testing for usernames here.
			prefix = prefix.trim();

			/** match of the closest word left of the cursor */
			const match1 = /^([\s\S!/]*?)([A-Za-z0-9][^, \n]*)$/.exec(prefix);
			/** match of the closest two words left of the cursor */
			const match2 = /^([\s\S!/]*?)([A-Za-z0-9][^, \n]* [^, ]*)$/.exec(prefix);
			if (!match1 && !match2) return true;

			const candidates: AutoCompleteCandidate[] = [];
			const idprefix = (match1 ? toID(match1[2]) : '');
			let spaceprefix = (match2 ? match2[2].replace(/[^A-Za-z0-9 ]+/g, '').toLowerCase() : '');
			if (match2 && (match2[0] === '/' || match2[0] === '!')) spaceprefix = '';
			for (const userid in users) {
				if (spaceprefix && users[userid].slice(1).replace(/[^A-Za-z0-9 ]+/g, '')
					.toLowerCase()
					.startsWith(spaceprefix)) {
					if (match2) candidates.push({ type: "user", userid, prefixIndex: match2[1].length });
				} else if (idprefix && userid.startsWith(idprefix)) {
					if (match1) candidates.push({ type: "user", userid, prefixIndex: match1[1].length });
				}
			}
			// Sort by most recent to speak in the chat, or, in the case of a tie,
			// in alphabetical order.
			const userActivity = this.props.room.userActivity;
			candidates.sort((a, b) => {
				// command autocomplete options aren't added until after the user autocomplete options are sorted.
				if (a.type !== "user" || b.type !== "user") return 0;
				if (a.prefixIndex !== b.prefixIndex) {
					// shorter prefix length comes first
					return a.prefixIndex - b.prefixIndex;
				}
				const aIndex = userActivity?.indexOf(a.userid as ID) ?? -1;
				const bIndex = userActivity?.indexOf(b.userid as ID) ?? -1;
				if (aIndex !== bIndex) {
					return bIndex - aIndex; // -1 is fortunately already in the correct order
				}
				return (a.userid < b.userid) ? -1 : 1; // alphabetical order
			});

			const currentLine = prefix.substring(prefix.lastIndexOf('\n') + 1);
			const isCommandWord = (word: string) => (word.startsWith('/') && !word.startsWith('//')) || word.startsWith('!');
			const currentWord = currentLine.substring(currentLine.lastIndexOf(' ') + 1);
			const isCommandSearch = isCommandWord(currentWord);
			if (isCommandSearch) {
				PS.mainmenu.makeQuery('cmdsearch', currentWord, true).then((data: string[]) => {
					const cmds = data.sort((a, b) => a.length < b.length ? 1 : -1);
					const nextCmd = cmds[cmds.length - 1];
					const newValue = nextCmd + value.substring(end);
					this.setValue(newValue, nextCmd.length, nextCmd.length);
					const currentCandidates = this.tabComplete?.candidates ?? [];
					for (const cmd of cmds) {
						currentCandidates.unshift({ type: "command", command: cmd });
					}
					this.tabComplete = {
						candidates: currentCandidates,
						candidateIndex: 0,
						prefix: nextCmd,
						cursor: nextCmd,
					};
				});
				return true;
			}

			if (!candidates.length) {
				this.tabComplete = null;
				return true;
			}
			this.tabComplete = {
				candidates,
				candidateIndex: 0,
				prefix,
				cursor: prefix,
			};
		}
		// Substitute in the tab-completed name
		const candidate = this.tabComplete.candidates[this.tabComplete.candidateIndex];
		if (candidate.type === "user") {
			let name = users[candidate.userid];
			if (!name) return true;

			name = Dex.getShortName(name.slice(1)); // Remove rank and busy characters
			const cursor = this.tabComplete.prefix.slice(0, candidate.prefixIndex) + name;
			this.setValue(cursor + value.slice(end), cursor.length);
			this.tabComplete.cursor = cursor;
		} else {
			const prefixIndex = prefix.lastIndexOf('\n') + 1;
			const fullPrefix = prefix.substring(0, prefixIndex) + Dex.getShortName(candidate.command);
			const newValue = fullPrefix + value.substring(end);
			this.setValue(newValue, fullPrefix.length, fullPrefix.length);
			this.tabComplete.cursor = fullPrefix;
			this.tabComplete.prefix = fullPrefix;
		}
		return true;
	}
	setSelection(start: number, end: number) {
		if (this.miniedit) {
			this.miniedit.setSelection({start, end});
		} else {
			this.textbox.setSelectionRange?.(start, end);
		}
	}
	toggleFormatChar(formatChar: string) {
		let value = this.getValue();
		let {start, end} = this.getSelection();

		// make sure start and end aren't midway through the syntax
		if (value.charAt(start) === formatChar && value.charAt(start - 1) === formatChar &&
			value.charAt(start - 2) !== formatChar) {
			start++;
		}
		if (value.charAt(end) === formatChar && value.charAt(end - 1) === formatChar &&
			value.charAt(end - 2) !== formatChar) {
			end--;
		}

		// wrap in doubled format char
		const wrap = formatChar + formatChar;
		value = value.substr(0, start) + wrap + value.substr(start, end - start) + wrap + value.substr(end);
		start += 2;
		end += 2;

		// prevent nesting
		const nesting = wrap + wrap;
		if (value.substr(start - 4, 4) === nesting) {
			value = value.substr(0, start - 4) + value.substr(start);
			start -= 4;
			end -= 4;
		} else if (start !== end && value.substr(start - 2, 4) === nesting) {
			value = value.substr(0, start - 2) + value.substr(start + 2);
			start -= 2;
			end -= 4;
		}
		if (value.substr(end, 4) === nesting) {
			value = value.substr(0, end) + value.substr(end + 4);
		} else if (start !== end && value.substr(end - 2, 4) === nesting) {
			value = value.substr(0, end - 2) + value.substr(end + 2);
			end -= 2;
		}

		this.setValue(value, {start, end});
		return true;
	}
	override render() {
		const OLD_TEXTBOX = false;
		return <div
			class="chat-log-add hasuserlist" onClick={this.focusIfNoSelection} style={{left: this.props.left || 0}}
		>
			<form class="chatbox">
				<label style={{color: BattleLog.usernameColor(PS.user.userid)}}>{PS.user.name}:</label>
				{OLD_TEXTBOX ? <textarea
					class={this.props.room.connected ? 'textbox' : 'textbox disabled'}
					autofocus
					rows={1}
					onInput={this.update}
					onKeyDown={this.onKeyDown}
					style={{resize: 'none', width: '100%', height: '16px', padding: '2px 3px 1px 3px'}}
					placeholder={PS.focusPreview(this.props.room)}
				/> : <ChatTextBox
					class={this.props.room.connected ? 'textbox' : 'textbox disabled'}
					placeholder={PS.focusPreview(this.props.room)}
				/>}
			</form>
		</div>;
	}
}

class ChatTextBox extends preact.Component<{placeholder: string, class: string}> {
	override shouldComponentUpdate() {
		return false;
	}
	override render() {
		return <pre class={this.props.class} placeholder={this.props.placeholder}>{'\n'}</pre>;
	}
}

class ChatPanel extends PSRoomPanel<ChatRoom> {
	send = (text: string) => {
		this.props.room.send(text);
	};
	focus() {
		// Called synchronously after a forceUpdate, so before the DOM has
		// been updated to make the panel visible. The order isn't
		// important for textboxes, which can be focused while inside a
		// `display: none` element, but contentEditable boxes are pickier.
		// Waiting for a 0 timeout turns out to be enough.
		setTimeout(() => {
			(this.base!.querySelector('textarea, pre.textbox') as HTMLElement).focus();
		}, 0);
	}
	focusIfNoSelection = () => {
		const selection = window.getSelection()!;
		if (selection.type === 'Range') return;
		this.focus();
	};
	onKey = (e: KeyboardEvent) => {
		if (e.keyCode === 33) { // Pg Up key
			const chatLog = this.base!.getElementsByClassName('chat-log')[0] as HTMLDivElement;
			chatLog.scrollTop = chatLog.scrollTop - chatLog.offsetHeight + 60;
			return true;
		} else if (e.keyCode === 34) { // Pg Dn key
			const chatLog = this.base!.getElementsByClassName('chat-log')[0] as HTMLDivElement;
			chatLog.scrollTop = chatLog.scrollTop + chatLog.offsetHeight - 60;
			return true;
		}
		return false;
	};
	makeChallenge = (e: Event, format: string, team?: Team) => {
		const room = this.props.room;
		const packedTeam = team ? team.packedTeam : '';
		if (!room.pmTarget) throw new Error("Not a PM room");
		PS.send(`|/utm ${packedTeam}`);
		PS.send(`|/challenge ${room.pmTarget}, ${format}`);
		room.challengeMenuOpen = false;
		room.challengingFormat = format;
		room.update(null);
	};
	acceptChallenge = (e: Event, format: string, team?: Team) => {
		const room = this.props.room;
		const packedTeam = team ? team.packedTeam : '';
		if (!room.pmTarget) throw new Error("Not a PM room");
		PS.send(`|/utm ${packedTeam}`);
		this.props.room.send(`/accept`);
		room.challengedFormat = null;
		room.update(null);
	};
	render() {
		const room = this.props.room;
		const tinyLayout = room.width < 450;

		const challengeTo = room.challengingFormat ? <div class="challenge">
			<TeamForm format={room.challengingFormat} onSubmit={null}>
				<button name="cmd" value="/cancelchallenge" class="button">Cancel</button>
			</TeamForm>
		</div> : room.challengeMenuOpen ? <div class="challenge">
			<TeamForm onSubmit={this.makeChallenge}>
				<button type="submit" class="button"><strong>Challenge</strong></button> {}
				<button name="cmd" value="/cancelchallenge" class="button">Cancel</button>
			</TeamForm>
		</div> : null;

		const challengeFrom = room.challengedFormat ? <div class="challenge">
			<TeamForm format={room.challengedFormat} onSubmit={this.acceptChallenge}>
				<button type="submit" class="button"><strong>Accept</strong></button> {}
				<button name="cmd" value="/reject" class="button">Reject</button>
			</TeamForm>
		</div> : null;

		return <PSPanelWrapper room={room} focusClick noScroll fullSize>
			<ChatLog
				class={`chat-log${tinyLayout ? '' : ' hasuserlist'}`} room={this.props.room}
				left={tinyLayout ? 0 : 146} top={room.tour?.info.isActive ? 30 : 0}
			>
				{challengeTo}{challengeFrom}{PS.isOffline && <p class="buttonbar">
					<button class="button" data-cmd="/reconnect">
						<i class="fa fa-plug" aria-hidden></i> <strong>Reconnect</strong>
					</button> {}
					{PS.connection?.reconnectTimer && <small>(Autoreconnect in {Math.round(PS.connection.reconnectDelay / 1000)}s)</small>}
				</p>}
			</ChatLog>
			<ChatTextEntry room={this.props.room} onMessage={this.send} onKey={this.onKey} left={tinyLayout ? 0 : 146} />
			<ChatUserList room={this.props.room} minimized={tinyLayout} />
		</PSPanelWrapper>;
	}
}

class ChatUserList extends preact.Component<{room: ChatRoom, left?: number, minimized?: boolean}> {
	subscription: PSSubscription | null = null;
	state = {
		expanded: false,
	};
	toggleExpanded = () => {
		this.setState({expanded: !this.state.expanded});
	};
	componentDidMount() {
		this.subscription = this.props.room.subscribe(msg => {
			if (!msg) this.forceUpdate();
		});
	}
	componentWillUnmount() {
		if (this.subscription) this.subscription.unsubscribe();
	}
	render() {
		const room = this.props.room;
		let userList = Object.entries(room.users) as [ID, string][];
		PSUtils.sortBy(userList, ([id, name]) => (
			[PS.server.getGroup(name.charAt(0)).order, !name.endsWith('@!'), id]
		));
		return <ul class={'userlist' + (this.props.minimized ? (this.state.expanded ? ' userlist-maximized' : ' userlist-minimized') : '')} style={{left: this.props.left || 0}}>
			<li class="userlist-count" onClick={this.toggleExpanded}><small>{room.userCount} users</small></li>
			{userList.map(([userid, name]) => {
				const groupSymbol = name.charAt(0);
				const group = PS.server.groups[groupSymbol] || {type: 'user', order: 0};
				let color;
				if (name.endsWith('@!')) {
					name = name.slice(0, -2);
					color = '#888888';
				} else {
					color = BattleLog.usernameColor(userid);
				}
				return <li key={userid}><button class="userbutton username" data-name={name}>
					<em class={`group${['leadership', 'staff'].includes(group.type!) ? ' staffgroup' : ''}`}>
						{groupSymbol}
					</em>
					{group.type === 'leadership' ?
						<strong><em style={{color}}>{name.substr(1)}</em></strong>
					: group.type === 'staff' ?
						<strong style={{color}}>{name.substr(1)}</strong>
					:
						<span style={{color}}>{name.substr(1)}</span>
					}
				</button></li>;
			})}
		</ul>;
	}
}

class ChatLog extends preact.Component<{
	class: string, room: ChatRoom, onClick?: (e: Event) => void, children?: preact.ComponentChildren,
	left?: number, top?: number, noSubscription?: boolean;
}> {
	log: BattleLog | null = null;
	subscription: PSSubscription | null = null;
	componentDidMount() {
		if (!this.props.noSubscription) {
			this.log = new BattleLog(this.base! as HTMLDivElement);
		}
		this.subscription = this.props.room.subscribe(tokens => {
			if (!tokens) return;
			switch (tokens[0]) {
			case 'users':
				const usernames = tokens[1].split(',');
				const count = parseInt(usernames.shift()!, 10);
				this.props.room.setUsers(count, usernames);
				return;
			case 'join': case 'j': case 'J':
				this.props.room.addUser(tokens[1]);
				break;
			case 'leave': case 'l': case 'L':
				this.props.room.removeUser(tokens[1]);
				break;
			case 'name': case 'n': case 'N':
				this.props.room.renameUser(tokens[1], tokens[2]);
				break;
			}
			if (!this.props.noSubscription) this.log!.add(tokens);
		});
		this.setControlsJSX(this.props.children);
	}
	componentWillUnmount() {
		if (this.subscription) this.subscription.unsubscribe();
	}
	shouldComponentUpdate(props: typeof ChatLog.prototype.props) {
		if (props.class !== this.props.class) {
			this.base!.className = props.class;
		}
		if (props.left !== this.props.left) this.base!.style.left = `${props.left || 0}px`;
		if (props.top !== this.props.top) this.base!.style.top = `${props.top || 0}px`;
		this.setControlsJSX(props.children);
		this.updateScroll();
		return false;
	}
	setControlsJSX(jsx: preact.ComponentChildren | undefined) {
		const children = this.base!.children;
		let controlsElem = children[children.length - 1] as HTMLDivElement | undefined;
		if (controlsElem && controlsElem.className !== 'controls') controlsElem = undefined;
		if (!jsx) {
			if (!controlsElem) return;
			preact.render(null, this.base!, controlsElem);
			this.updateScroll();
			return;
		}
		if (!controlsElem) {
			controlsElem = document.createElement('div');
			controlsElem.className = 'controls';
			this.base!.appendChild(controlsElem);
		}
		preact.render(<div class="controls">{jsx}</div>, this.base!, controlsElem);
		this.updateScroll();
	}
	updateScroll() {
		if (this.log) {
			this.log.updateScroll();
		} else if (this.props.room.battle) {
			this.log = (this.props.room.battle as Battle).scene.log;
			this.log.updateScroll();
		}
	}
	render() {
		return <div class={this.props.class} role="log" onClick={this.props.onClick} style={{
			left: this.props.left || 0, top: this.props.top || 0,
		}}></div>;
	}
}

PS.roomTypes['chat'] = {
	Model: ChatRoom,
	Component: ChatPanel,
};
PS.updateRoomTypes();
