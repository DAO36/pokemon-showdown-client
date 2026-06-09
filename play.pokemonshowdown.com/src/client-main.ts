/**
 * Client main
 *
 * Dependencies: client-core
 *
 * Sets up the main client models: Prefs, Teams, User, and PS.
 *
 * @author Guangcong Luo <guancongluo@gmail.com>
 * @license AGPLv3
 */

/**********************************************************************
 * Prefs
 *********************************************************************/

/**
 * String that contains only lowercase alphanumeric characters.
 */
type RoomID = string & {__isRoomID: true};

const PSPrefsDefaults: {[key: string]: any} = {};

/**
 * Tracks user preferences, stored in localStorage. Contains most local
 * data, with the exception of backgrounds, teams, and session data,
 * which get their own models.
 *
 * Updates will name the key updated, so you don't need to overreact.
 */
class PSPrefs extends PSStreamModel<string | null> {
	/**
	 * The theme to use. "system" matches the theme of the system accessing the client.
	 */
	theme: 'light' | 'dark' | 'system' = 'light';
	/**
	 * Disables animated GIFs, but keeps other animations enabled.
	 * Workaround for a Chrome 64 bug with GIFs.
	 * true - Disable GIFs, will be automatically re-enabled if you
	 *   switch away from Chrome 64.
	 * false - Enable GIFs all the time.
	 * null - Enable GIFs only on Chrome 64.
	 */
	nogif: boolean | null = null;

	/* Graphics Preferences */
	noanim: boolean | null = null;
	bwgfx: boolean | null = null;
	nopastgens: boolean | null = null;

	/* Chat Preferences */
	inchatpm: boolean | null = null;
	noselfhighlight: boolean | null = null;
	temporarynotifications: boolean | null = null;
	leavePopupRoom: boolean | null = null;
	refreshprompt: boolean | null = null;
	chatformatting: Record<string, boolean> = {
		hidegreentext: false,
		hideme: false,
		hidespoiler: false,
		hidelinks: false,
		hideinterstice: true,
	};
	nounlink: boolean | null = null;

	/* Battle preferences */
	ignorenicks: boolean | null = null;
	ignorespects: boolean | null = null;
	ignoreopp: boolean | null = null;
	autotimer: boolean | null = null;
	autohardcore: boolean | null = null;
	spectatefromstart: boolean | null = null;
	rightpanelbattles: boolean | null = null;
	disallowspectators: boolean | null = null;
	starredformats: { [formatid: string]: true | undefined } | null = null;

	/**
	 * Show "User joined" and "User left" messages. serverid:roomid
	 * table. Uses 1 and 0 instead of true/false for JSON packing
	 * reasons.
	 */
	showjoins: {[serverid: string]: {[roomid: string]: 1 | 0}} | null = null;
	/**
	 * true = one panel, false = two panels, left and right
	 */
	onepanel = false;

	mute = false;
	effectvolume = 50;
	musicvolume = 50;
	notifvolume = 50;
	uploadprivacy = false;

	afd: boolean | 'sprites' = undefined!;

	highlights: Record<string, string[]> | null = null;
	logtimes: { [serverid: ID]: { [roomid: RoomID]: number } } | null = null;

	avatar: string | null = null;
	serversettings: {
		blockPMs?: boolean | string,
		blockChallenges?: boolean,
		language?: string,
	} = {};

	// PREFS END HERE

	storageEngine: 'localStorage' | 'iframeLocalStorage' | '' = '';
	storage: {[k: string]: any} = {};
	readonly origin = `https://${Config.routes.client}`;
	constructor() {
		super();

		for (const key in this) {
			const value = (this as any)[key];
			if (['storage', 'subscriptions', 'origin', 'storageEngine'].includes(key)) continue;
			if (typeof value === 'function') continue;
			PSPrefsDefaults[key] = value;
		}

		// set up local loading
		try {
			if (window.localStorage) {
				this.storageEngine = 'localStorage';
				this.load(JSON.parse(localStorage.getItem('showdown_prefs')!) || {}, true);
			}
		} catch {}
	}
	/**
	 * Change a preference.
	 */
	set<T extends keyof PSPrefs>(key: T, value: PSPrefs[T]) {
		if (value === null) {
			delete this.storage[key];
			(this as any)[key] = PSPrefsDefaults[key];
		} else {
			this.storage[key] = value;
			(this as any)[key] = value;
		}
		this.update(key);
		this.save();
	}
	load(newPrefs: object, noSave?: boolean) {
		this.fixPrefs(newPrefs);
		Object.assign(this, PSPrefsDefaults);
		this.storage = newPrefs;
		for (const key in PSPrefsDefaults) {
			if (key in newPrefs) (this as any)[key] = (newPrefs as any)[key];
		}

		this.setAFD();
		this.setShowDebug();

		this.update(null);
		if (!noSave) this.save();
	}
	save() {
		switch (this.storageEngine) {
		case 'localStorage':
			localStorage.setItem('showdown_prefs', JSON.stringify(this.storage));
		}
	}
	fixPrefs(newPrefs: any) {
		const oldShowjoins = newPrefs['showjoins'];
		if (oldShowjoins !== undefined && typeof oldShowjoins !== 'object') {
			const showjoins: {[serverid: string]: {[roomid: string]: 1 | 0}} = {};
			const serverShowjoins: {[roomid: string]: 1 | 0} = {global: (oldShowjoins ? 1 : 0)};
			const showroomjoins = newPrefs['showroomjoins'] as {[roomid: string]: boolean};
			for (const roomid in showroomjoins) {
				serverShowjoins[roomid] = (showroomjoins[roomid] ? 1 : 0);
			}
			delete newPrefs['showroomjoins'];
			showjoins[Config.server.id] = serverShowjoins;
			newPrefs['showjoins'] = showjoins;
		}

		// incorrect storage of serversettings
		delete newPrefs['blockPMs'];
		delete newPrefs['blockChallenges'];
		delete newPrefs['language'];

		const isChrome64 = navigator.userAgent.includes(' Chrome/64.');
		if (newPrefs['nogif'] !== undefined) {
			if (!isChrome64) {
				delete newPrefs['nogif'];
			}
		} else if (isChrome64) {
			newPrefs['nogif'] = true;
			alert('Your version of Chrome has a bug that makes animated GIFs freeze games sometimes, so certain animations have been disabled. Only some people have the problem, so you can experiment and enable them in the Options menu setting "Disable GIFs for Chrome 64 bug".');
		}

		const colorSchemeQuerySupported = window.matchMedia?.('(prefers-color-scheme: dark)').media !== 'not all';
		if (newPrefs['theme'] === 'system' && !colorSchemeQuerySupported) {
			newPrefs['theme'] = 'light';
		}
		if (newPrefs['dark'] !== undefined) {
			if (newPrefs['dark']) {
				newPrefs['theme'] = 'dark';
			}
			delete newPrefs['dark'];
		}
	}

	setAFD(mode?: typeof this['afd']) {
		if (mode === undefined) {
			// init
			if (typeof BattleTextAFD !== 'undefined') {
				for (const id in BattleTextNotAFD) {
					if (!BattleTextAFD[id]) {
						BattleTextAFD[id] = BattleTextNotAFD[id];
					} else {
						BattleTextAFD[id] = { ...BattleTextNotAFD[id], ...BattleTextAFD[id] };
					}
				}
			}

			if (Config.server?.afd) {
				mode = true;
			} else if (this.afd !== undefined) {
				mode = this.afd;
			} else {
				// uncomment on April Fools' Day
				// mode = true;
			}
		}

		Dex.afdMode = mode;

		if (typeof BattleTextAFD !== 'undefined') {
			if (mode === true) {
				(BattleText as any) = BattleTextAFD;
			} else {
				(BattleText as any) = BattleTextNotAFD;
			}
		}
	}
	setShowDebug(mode = this.showdebug) {
		const css = mode ? `.debug {display: block;}` : `.debug {display: none;}`;
		let style = document.querySelector('style[id=debugstyle]');
		if (style) {
			style.innerHTML = css;
		} else {
			style = document.createElement('style');
			style.id = "debugstyle";
			style.innerHTML = css;
			document.querySelector('head')?.append(style);
		}
	}
	doAutojoin() {
		let autojoin = PS.prefs.autojoin;
		if (autojoin) {
			if (typeof autojoin === 'string') {
				autojoin = { showdown: autojoin };
			}
			let rooms = autojoin[PS.server.id] || '';
			for (let title of rooms.split(",")) {
				const id = /[^a-z0-9-]/.test(title) ? toID(title) as any as RoomID : title as RoomID;
				PS.addRoom({ id, title, connected: true, autofocus: false });
			};
			const cmd = `/autojoin ${rooms}`;
			if (PS.connection?.queue.includes(cmd)) {
				// don't jam up the queue with autojoin requests
				// sending autojoin again after a prior autojoin successfully resolves likely returns an error from the server
				return;
			}
			// send even if `rooms` is empty, for server autojoins
			PS.send(cmd);
		}

		for (const roomid in PS.rooms) {
			const room = PS.rooms[roomid]!;
			if (room.type === 'battle') {
				room.connect();
			}
		}
	}
}

/**********************************************************************
 * Teams
 *********************************************************************/

interface Team {
	name: string;
	format: ID;
	packedTeam: string;
	folder: string;
	/** The icon cache must be cleared (to `null`) whenever `packedTeam` is modified */
	iconCache: preact.ComponentChildren;
	key: string;
}
if (!window.BattleFormats) window.BattleFormats = {};

/**
 * This model tracks teams and formats, updating when either is updated.
 */
class PSTeams extends PSStreamModel<'team' | 'format'> {
	/** false if it uses the ladder in the website */
	usesLocalLadder = false;
	list: Team[] = [];
	byKey: {[key: string]: Team | undefined} = {};
	deletedTeams: [Team, number][] = [];
	constructor() {
		super();
		try {
			this.unpackAll(localStorage.getItem('showdown_teams'));
		} catch {}
	}
	teambuilderFormat(format: string): ID {
		const ruleSepIndex = format.indexOf('@@@');
		if (ruleSepIndex >= 0) format = format.slice(0, ruleSepIndex);
		const formatid = toID(format);
		if (!window.BattleFormats) return formatid;
		const formatEntry = BattleFormats[formatid];
		return formatEntry?.teambuilderFormat || formatid;
	}
	getKey(name: string) {
		const baseKey: string = toID(name) || '0';
		let key = baseKey;
		let i = 1;
		while (key in this.byKey) {
			i++;
			key = `${baseKey}-${i}`;
		}
		return key;
	}
	unpackAll(buffer: string | null) {
		if (!buffer) {
			this.list = [];
			return;
		}

		if (buffer.charAt(0) === '[' && !buffer.trim().includes('\n')) {
			this.unpackOldBuffer(buffer);
			return;
		}

		this.list = [];
		for (const line of buffer.split('\n')) {
			const team = this.unpackLine(line);
			if (team) this.push(team);
		}
		this.update('team');
	}
	push(team: Team) {
		team.key = this.getKey(team.name);
		this.list.push(team);
		this.byKey[team.key] = team;
	}
	unshift(team: Team) {
		team.key = this.getKey(team.name);
		this.list.unshift(team);
		this.byKey[team.key] = team;
	}
	delete(team: Team) {
		const teamIndex = this.list.indexOf(team);
		if (teamIndex < 0) return false;
		this.deletedTeams.push([team, teamIndex]);
		this.list.splice(teamIndex, 1);
		delete this.byKey[team.key];
	}
	undelete() {
		if (!this.deletedTeams.length) return;
		const [team, teamIndex] = this.deletedTeams.pop()!;
		this.list.splice(teamIndex, 0, team);
		if (this.byKey[team.key]) team.key = this.getKey(team.name);
		this.byKey[team.key] = team;
	}
	unpackOldBuffer(buffer: string) {
		alert(`Your team storage format is too old for PS. You'll need to upgrade it at https://${Config.routes.client}/recoverteams.html`);
		this.list = [];
		return;
	}
	packAll(teams: Team[]) {
		return teams.map(team => (
			(team.format ? `${team.format}]` : ``) + (team.folder ? `${team.folder}/` : ``) + team.name + `|` + team.packedTeam
		)).join('\n');
	}
	save() {
		try {
			localStorage.setItem('showdown_teams', this.packAll(this.list));
		} catch {}
		this.update('team');
	}
	unpackLine(line: string): Team | null {
		let pipeIndex = line.indexOf('|');
		if (pipeIndex < 0) return null;
		let bracketIndex = line.indexOf(']');
		if (bracketIndex > pipeIndex) bracketIndex = -1;
		let slashIndex = line.lastIndexOf('/', pipeIndex);
		if (slashIndex < 0) slashIndex = bracketIndex; // line.slice(slashIndex + 1, pipeIndex) will be ''
		let format = bracketIndex > 0 ? line.slice(0, bracketIndex) : 'gen7';
		if (format.slice(0, 3) !== 'gen') format = 'gen6' + format;
		const name = line.slice(slashIndex + 1, pipeIndex);
		return {
			name,
			format: format as ID,
			folder: line.slice(bracketIndex + 1, slashIndex > 0 ? slashIndex : bracketIndex + 1),
			packedTeam: line.slice(pipeIndex + 1),
			iconCache: null,
			key: '',
		};
	}
	loadRemoteTeams() {
		PSLoginServer.query('getteams').then(data => {
			if (!data) return;
			if (data.actionerror) {
				return PS.alert('Error loading uploaded teams: ' + data.actionerror);
			}
			const teams: { [key: string]: UploadedTeam } = {};
			for (const team of data.teams) {
				teams[team.teamid] = team;
			}

			const NOT_LOADED_REGEX = /^[^|]*\|\|\|\|\|\|\|\|\|\|\|(?:\][^|]*\|\|\|\|\|\|\|\|\|\|\|)*$/;
			// find exact teamid matches
			for (const localTeam of this.list) {
				if (localTeam.teamid) {
					const team = teams[localTeam.teamid];
					if (!team) {
						continue;
					}
					localTeam.uploaded = {
						teamid: team.teamid,
						notLoaded: NOT_LOADED_REGEX.test(localTeam.packedTeam),
						private: team.private,
					};
					delete teams[localTeam.teamid];
				}
			}

			// do best-guess matches for teams that don't have a local team with matching teamid
			for (const team of Object.values(teams)) {
				let matched = false;
				for (const localTeam of this.list) {
					if (localTeam.teamid) continue;

					const compare = this.compareTeams(team, localTeam);
					if (compare === 'rename') {
						if (!localTeam.name.endsWith(' (local version)')) localTeam.name += ' (local version)';
					} else if (compare) {
						// prioritize locally saved teams over remote
						// as so to not overwrite changes
						matched = true;
						localTeam.teamid = team.teamid;
						localTeam.uploaded = {
							teamid: team.teamid,
							notLoaded: NOT_LOADED_REGEX.test(localTeam.packedTeam),
							private: team.private,
						};
						break;
					}
				}
				if (!matched) {
					const newTeam: Team = {
						name: team.name,
						format: team.format,
						folder: '',
						packedTeam: this.unloadedPackedTeam(team.team),
						iconCache: null,
						isBox: false,
						key: this.getKey(team.name),
						teamid: team.teamid,
						uploaded: {
							teamid: team.teamid,
							notLoaded: true,
							private: team.private,
						},
					};
					this.push(newTeam);
				}
			}
		});
	}
	unloadedPackedTeam(uploadedTeam: string) {
		const mons = uploadedTeam.split(',').map((m: string) => ({ species: m, moves: [] }));
		return Teams.pack(mons);
	}
	loadTeam(team: Team | undefined | null, ifNeeded: true): void | Promise<void>;
	loadTeam(team: Team | undefined | null): Promise<void>;
	loadTeam(team: Team | undefined | null, ifNeeded?: boolean): void | Promise<void> {
		if (!team?.uploaded || team.uploadedPackedTeam) return ifNeeded ? undefined : Promise.resolve();
		if (team.uploaded.notLoaded && team.uploaded.notLoaded !== true) return team.uploaded.notLoaded;

		const notLoaded = team.uploaded.notLoaded;
		return (team.uploaded.notLoaded = PSLoginServer.query('getteam', {
			teamid: team.uploaded.teamid,
		}).then(data => {
			if (!team.uploaded) return;
			if (!data?.team) {
				PS.alert(`Failed to load team: ${data?.actionerror || "Error unknown. Try again later."}`);
				return;
			}
			team.uploaded.notLoaded = false;
			team.uploadedPackedTeam = data.team;
			if (notLoaded) {
				team.packedTeam = data.team;
				PS.teams.save();
			}
		}));
	}
	compareTeams(serverTeam: UploadedTeam, localTeam: Team) {
		// TODO: decide if we want this
		// if (serverTeam.teamid === localTeam.teamid && localTeam.teamid) return true;

		// if titles match exactly and mons are the same, assume they're the same team
		// if they don't match, it might be edited, but we'll go ahead and add it to the user's
		// teambuilder since they may want that old version around. just go ahead and edit the name
		let sanitize = (name: string) => (name || "").replace(/\s+\(server version\)/g, '').trim();
		const nameMatches = sanitize(serverTeam.name) === sanitize(localTeam.name);
		if (!(nameMatches && serverTeam.format === localTeam.format)) {
			return false;
		}
		// if it's been edited since, invalidate the team id on this one (count it as new)
		// and load from server
		const mons = serverTeam.team.split(',').map(toID).sort().join(',');
		const otherMons = Teams.unpackSpeciesOnly(localTeam.packedTeam).map(toID).sort().join(',');
		if (mons !== otherMons) return 'rename';
		return true;
	}
}

/**********************************************************************
 * User
 *********************************************************************/

class PSUser extends PSModel {
	name = "";
	group = '';
	userid = "" as ID;
	named = false;
	registered = false;
	avatar = "1";
	setName(fullName: string, named: boolean, avatar: string) {
		const loggingIn = (!this.named && named);
		const {name, group} = BattleTextParser.parseNameParts(fullName);
		this.name = name;
		this.group = group;
		this.userid = toID(name);
		this.named = named;
		this.avatar = avatar;
		this.update();
		if (loggingIn) {
			for (const roomid in PS.rooms) {
				const room = PS.rooms[roomid]!;
				if (room.connectWhenLoggedIn) room.connect();
			}
		}
	}
	logOut() {
		PSLoginServer.query({
			act: 'logout',
			userid: this.userid,
		});
		PS.send('|/logout');
		PS.connection?.disconnect();

		alert("You have been logged out and disconnected.\n\nIf you wanted to change your name while staying connected, use the 'Change Name' button or the '/nick' command.");
		this.name = "";
		this.group = '';
		this.userid = "" as ID;
		this.named = false;
		this.registered = false;
		this.update();
	}
}

/**********************************************************************
 * Server
 *********************************************************************/

interface PSGroup {
	name?: string;
	type?: 'leadership' | 'staff' | 'punishment';
	order: number;
}

class PSServer {
	id = Config.defaultserver.id;
	host = Config.defaultserver.host;
	port = Config.defaultserver.port;
	altport = Config.defaultserver.altport;
	registered = Config.defaultserver.registered;
	prefix = '/showdown';
	protocol: 'http' | 'https' = Config.defaultserver.httpport ? 'https' : 'http';
	groups: {[symbol: string]: PSGroup} = {
		'~': {
			name: "Administrator (~)",
			type: 'leadership',
			order: 101,
		},
		'#': {
			name: "Room Owner (#)",
			type: 'leadership',
			order: 102,
		},
		'&': {
			name: "Administrator (&)",
			type: 'leadership',
			order: 103,
		},
		'\u2605': {
			name: "Host (\u2605)",
			type: 'staff',
			order: 104,
		},
		'@': {
			name: "Moderator (@)",
			type: 'staff',
			order: 105,
		},
		'%': {
			name: "Driver (%)",
			type: 'staff',
			order: 106,
		},
		// by default, unrecognized ranks go here, between driver and bot
		'*': {
			name: "Bot (*)",
			order: 109,
		},
		'\u2606': {
			name: "Player (\u2606)",
			order: 110,
		},
		'+': {
			name: "Voice (+)",
			order: 200,
		},
		' ': {
			order: 201,
		},
		'!': {
			name: "Muted (!)",
			type: 'punishment',
			order: 301,
		},
		'✖': {
			name: "Namelocked (\u2716)",
			type: 'punishment',
			order: 302,
		},
		'\u203d': {
			name: "Locked (\u203d)",
			type: 'punishment',
			order: 303,
		},
	};
	defaultGroup: PSGroup = {
		order: 108,
	};
	getGroup(symbol: string | undefined) {
		return this.groups[(symbol || ' ').charAt(0)] || this.defaultGroup;
	}
}

/**********************************************************************
 * Rooms
 *********************************************************************/

type PSRoomLocation = 'left' | 'right' | 'popup' | 'mini-window' | 'modal-popup';

interface RoomOptions {
	id: RoomID;
	title?: string;
	type?: string;
	location?: PSRoomLocation | null;
	/** Handled after initialization, outside of the constructor */
	queue?: Args[];
	parentElem?: HTMLElement | null;
	parentRoomid?: RoomID | null;
	rightPopup?: boolean;
	connected?: boolean;
	[k: string]: unknown;
}

interface PSNotificationState {
	title: string;
	body?: string;
	/** Used to identify notifications to be dismissed - '' if you only want to autodismiss */
	id: string;
	/** normally: automatically dismiss the notification when viewing the room; set this to require manual dismissing */
	noAutoDismiss: boolean;
}

/**
 * As a PSStreamModel, PSRoom can emit `Args` to mean "we received a message",
 * and `null` to mean "tell Preact to re-render this room"
 */
class PSRoom extends PSStreamModel<Args | null> implements RoomOptions {
	id: RoomID;
	title = "";
	type = '';
	readonly classType: string = '';
	location: PSRoomLocation = 'left';
	/**
	 * Whether a modal popup is closable by clicking on the
	 * background or pressing Esc. It is, of course, still closable
	 * through other methods.
	 */
	closable = true;
	/**
	 * Whether the room is connected to the server. This mostly tracks
	 * "should we send /leave if the user closes the room?"
	 *
	 * In particular, this is `true` after sending `/join`, and `false`
	 * after sending `/leave`, even before the server responds.
	 */
	connected: boolean = false;
	/**
	 * Can this room even be connected to at all?
	 * `true` = pass messages from the server to subscribers
	 * `false` = throw an error if we receive messages from the server
	 */
	readonly canConnect: boolean = false;
	connectWhenLoggedIn: boolean = false;
	onParentEvent: ((eventId: 'focus' | 'keydown', e?: Event) => false | void) | null = null;

	width = 0;
	height = 0;
	parentElem: HTMLElement | null = null;
	rightPopup = false;

	notifications: PSNotificationState[] = [];
	isSubtleNotifying = false;

	// for compatibility with RoomOptions
	[k: string]: unknown;

	constructor(options: RoomOptions) {
		super();
		this.id = options.id;
		if (options.title) this.title = options.title;
		if (!this.title) this.title = this.id;
		if (options.type) this.type = options.type;
		if (options.location) this.location = options.location;
		if (options.parentElem) this.parentElem = options.parentElem;
		if (options.parentRoomid) this.parentRoomid = options.parentRoomid;
		if (this.location !== 'popup' && this.location !== 'modal-popup') this.parentElem = null;
		if (options.rightPopup) this.rightPopup = true;
		if (options.connected) this.connected = true;
	}
	getParent() {
		if (this.parentRoomid) return PS.rooms[this.parentRoomid] || null;
		return null;
	}
	notify(options: { title: string, body?: string, noAutoDismiss?: boolean, id?: string }) {
		let desktopNotification: Notification | null = null;
		const roomIsFocused = document.hasFocus?.() && PS.isVisiblePanel(this);
		if (roomIsFocused && !options.noAutoDismiss) return;
		if (!roomIsFocused) {
			PS.playNotificationSound();
			try {
				desktopNotification = new Notification(options.title, { body: options.body });
				if (desktopNotification) {
					desktopNotification.onclick = () => {
						window.focus();
						PS.focusRoom(this.id);
					};
					if (PS.prefs.temporarynotifications) {
						setTimeout(() => { desktopNotification?.close(); }, 5000);
					}
				}
			} catch {}
		}
		if (options.noAutoDismiss && !options.id) {
			throw new Error(`Must specify id for manual dismissing`);
		}
		this.notifications.push({
			title: options.title,
			body: options.body,
			id: options.id || '',
			noAutoDismiss: options.noAutoDismiss || false,
		});
		PS.update();
	}
	subtleNotify() {
		if (PS.isVisiblePanel(this)) return;
		const room = PS.rooms[this.id] as ChatRoom;
		const lastSeenTimestamp = PS.prefs.logtimes?.[PS.server.id]?.[this.id] || 0;
		const lastMessageTime = +(room.lastMessage?.[1] || 0);
		this.isSubtleNotifying = !((lastMessageTime + room.timeOffset) <= lastSeenTimestamp);
		PS.update();
	}
	dismissNotificationAt(i: number) {
		try {
			this.notifications[i].notification?.close();
		} catch {}
		this.notifications.splice(i, 1);
	}
	dismissNotification(id: string) {
		this.notifications = this.notifications.filter(notification => notification.id !== id);
		PS.update();
	}
	autoDismissNotifications() {
		let room = PS.rooms[this.id] as ChatRoom;
		if (room.lastViewedTime) {
			// Mark chat messages as read to avoid double-notifying on reload
			let lastMessageDates = PS.prefs.logtimes || {};
			if (!lastMessageDates[PS.server.id]) lastMessageDates[PS.server.id] = {};
			lastMessageDates[PS.server.id][room.id] = room.lastViewedTime || 0;
			PS.prefs.set('logtimes', lastMessageDates);
		}
		for (let i = this.notifications.length - 1; i >= 0; i--) {
			if (!this.notifications[i].noAutoDismiss) {
				this.dismissNotificationAt(i);
			}
		}
		this.isSubtleNotifying = false;
	}
	setDimensions(width: number, height: number) {
		if (this.width === width && this.height === height) return;
		this.width = width;
		this.height = height;
		this.update(null);
	}
	connect(): void {
		throw new Error(`This room is not designed to connect to a server room`);
	}
	receiveLine(args: Args): void {
		switch (args[0]) {
		case 'title': {
			this.title = args[1];
			PS.update();
			break;
		} case 'tempnotify': {
			const [, id, title, body, toHighlight] = args;
			this.notify({title, body, id});
			break;
		} case 'tempnotifyoff': {
			const [, id] = args;
			this.dismissNotification(id);
			break;
		} default: {
			if (this.canConnect) {
				this.update(args);
			} else {
				throw new Error(`This room is not designed to receive messages`);
			}
		}}
	}
	/**
	 * Used only by commands; messages from the server go directly from
	 * `PS.receive` to `room.receiveLine`
	 */
	add(line: string, ifChat?: boolean) {
		if (this.type !== 'chat' && this.type !== 'battle') {
			if (!ifChat) {
				PS.mainmenu.handlePM(PS.user.userid, PS.user.userid);
				PS.rooms['dm-' as RoomID]?.receiveLine(BattleTextParser.parseLine(line));
			}
		} else {
			this.receiveLine(BattleTextParser.parseLine(line));
		}
	}
	errorReply(message: string, element = this.currentElement) {
		if (element?.tagName === 'BUTTON') {
			PS.alert(message, { parentElem: element });
		} else {
			this.add(`|error|${message}`);
		}
	}
	parseClientCommands(commands: ClientCommands<this>) {
		const parsedCommands: ParsedClientCommands = {};
		for (const cmd in commands) {
			const names = cmd.split(',').map(name => name.trim());
			for (const name of names) {
				if (name.includes(' ')) throw new Error(`Client command names cannot contain spaces: ${name}`);
				// good luck convincing TypeScript that these types are compatible
				parsedCommands[name as 'parsed'] = commands[cmd as 'cmd'] as any;
			}
		}
		return parsedCommands;
	}
	globalClientCommands = this.parseClientCommands({
		'j,join'(target, cmd, elem) {
			target = PS.router.extractRoomID(target) || target;
			const roomid = /[^a-z0-9-]/.test(target) ? toID(target) as any as RoomID : target as RoomID;
			PS.join(roomid, { parentElem: elem });
		},
		'part,leave,close'(target, cmd, elem) {
			const roomid = (/[^a-z0-9-]/.test(target) ? toID(target) as any as RoomID : target as RoomID) || this.id;
			const room = PS.rooms[roomid] as BattleRoom;
			const battle = room?.battle;

			if (room?.type === "battle" && !battle.ended && room.users[PS.user.userid]?.startsWith('☆') && !battle.isReplay) {
				PS.join("forfeitbattle" as RoomID, { parentElem: elem });
				return;
			}
			if (room?.type === "chat" && room.connected === true && PS.prefs.leavePopupRoom && !target) {
				PS.join("confirmleaveroom" as RoomID, { parentElem: elem });
				return;
			}
			if (room?.type === "chat" && room.challenging) {
				room.cancelChallenge();
			}

			PS.leave(roomid);
		},
		'closeand'(target) {
			// we actually do the close last, because a lot of things stop working
			// after you delete the room
			this.send(target);
			PS.leave(this.id);
		},
		'receivepopup'(target) {
			PS.alert(target);
		},
		'inopener,inparent'(target) {
			// do this command in the popup opener
			let room = this.getParent();
			if (room && PS.isPopup(room)) room = room.getParent();
			// will crash if the parent doesn't exist, which is fine
			room!.send(target);
		},
		'maximize'(target) {
			const roomid = /[^a-z0-9-]/.test(target) ? toID(target) as any as RoomID : target as RoomID;
			const targetRoom = roomid ? PS.rooms[roomid] : this;
			if (!targetRoom) return this.errorReply(`Room '${roomid}' not found.`);
			if (PS.isPanel(targetRoom)) {
				this.errorReply(`'${roomid}' is already maximized.`);
			} else if (!PS.isPopup(targetRoom)) {
				PS.moveRoom(targetRoom, 'left', false, 0);
				PS.update();
			} else {
				this.errorReply(`'${roomid}' is a popup and can't be maximized.`);
			}
		},
		'logout'() {
			PS.user.logOut();
		},
		'reconnect,connect'() {
			if (this.connected && this.connected !== 'autoreconnect') {
				return this.errorReply(`You are already connected.`);
			}

			if (!PS.isOffline) {
				// connect to room
				try {
					this.connect();
				} catch (err: any) {
					this.errorReply(err.message);
				}
				return;
			}

			// connect to server
			const uptime = Date.now() - PS.startTime;
			if (uptime > 24 * 60 * 60 * 1000) {
				PS.confirm(`It's been over a day since you first connected. Please refresh.`, {
					okButton: 'Refresh',
				}).then(confirmed => {
					if (confirmed) this.send(`/refresh`);
				});
				return;
			}
			PSConnection.connect();
		},
		'refresh'() {
			document.location.reload();
		},
		'workoffline'() {
			if (PS.isOffline) {
				return this.add(`|error|You are already offline.`);
			}
			PS.connection?.disconnect();
		},
		'cancelsearch'() {
			if (PS.mainmenu.cancelSearch()) {
				this.add(`||Search cancelled.`, true);
			} else {
				this.errorReply(`You're not currently searching.`);
			}
		},
		'disallowspectators'(target) {
			PS.prefs.set('disallowspectators', target !== 'off');
		},
		'star'(target) {
			const id = toID(target);
			if (!window.BattleFormats[id] && !/^gen[1-9]$/.test(id)) {
				this.errorReply(`Format ${id} does not exist`);
				return;
			}
			let starred = PS.prefs.starredformats || {};
			starred[id] = true;
			PS.prefs.set('starredformats', starred);
			this.add(`||Added format ${id} to favourites`);
			this.update(null);
		},
		'unstar'(target) {
			const id = toID(target);
			if (!window.BattleFormats[id] && !/^gen[1-9]$/.test(id)) {
				this.errorReply(`Format ${id} does not exist`);
				return;
			}
			let starred = PS.prefs.starredformats || {};
			if (!starred[id]) {
				this.errorReply(`${id} is not in your favourites!`);
				return;
			}
			delete starred[id];
			PS.prefs.set('starredformats', starred);
			this.add(`||Removed format ${id} from favourites`);
			this.update(null);
		},
		'nick'(target, cmd, element) {
			const noNameChange = PS.user.userid === toID(target);
			if (!noNameChange) PS.join('login' as RoomID, { parentElem: element });
			if (target) {
				PS.user.changeName(target);
			}
		},
		'avatar'(target) {
			target = target.toLowerCase();
			if (/[^a-z0-9-]/.test(target)) target = toID(target);
			const avatar = window.BattleAvatarNumbers?.[target] || target;
			PS.user.avatar = avatar;
			PS.prefs.set('avatar', avatar || null);
			if (this.type !== 'chat' && this.type !== 'battle') {
				PS.send(`/avatar ${avatar}`);
			} else {
				this.sendDirect(`/avatar ${avatar}`);
			}
		},
		'open,user'(target) {
			let roomid = `user-${toID(target)}` as RoomID;
			PS.join(roomid, {
				args: { username: target },
			});
		},
		'ignore'(target) {
			const ignore = PS.prefs.ignore || {};
			if (!target) return true;
			if (toID(target) === PS.user.userid) {
				this.add(`||You are not able to ignore yourself.`);
			} else if (ignore[toID(target)]) {
				this.add(`||User '${target}' is already on your ignore list. ` +
					`(Moderator messages will not be ignored.)`);
			} else {
				ignore[toID(target)] = 1;
				this.add(`||User '${target}' ignored. (Moderator messages will not be ignored.)`);
				PS.prefs.set("ignore", ignore);
			}
		},
		'unignore'(target) {
			const ignore = PS.prefs.ignore || {};
			if (!target) return false;
			if (!ignore[toID(target)]) {
				this.add(`||User '${target}' isn't on your ignore list.`);
			} else {
				ignore[toID(target)] = 0;
				this.add(`||User '${target}' no longer ignored.`);
				PS.prefs.set("ignore", ignore);
			}
		},
		'clearignore'(target) {
			if (toID(target) !== 'confirm') {
				this.add("||Are you sure you want to clear your ignore list?");
				this.add('|html|If you\'re sure, use <code>/clearignore confirm</code>');
				return false;
			}
			let ignoreList = PS.prefs.ignore || {};
			if (!Object.keys(ignoreList).length) return this.add("You have no ignored users.");
			PS.prefs.set('ignore', null);
			this.add("||Your ignore list was cleared.");
		},
		'ignorelist'(target) {
			let ignoreList = Object.keys(PS.prefs.ignore || {});
			if (ignoreList.length === 0) {
				this.add('||You are currently not ignoring anyone.');
			} else {
				let ignoring: string[] = [];
				for (const key in PS.prefs.ignore) {
					if (PS.prefs.ignore[key] === 1) ignoring.push(key);
				}
				if (!ignoring.length) return this.add('||You are currently not ignoring anyone.');
				this.add(`||You are currently ignoring: ${ignoring.join(', ')}`);
			}
		},
		'showjoins'(target) {
			let showjoins = PS.prefs.showjoins || {};
			let serverShowjoins = showjoins[PS.server.id] || {};
			if (target) {
				let room = toID(target);
				if (serverShowjoins['global']) {
					delete serverShowjoins[room];
				} else {
					serverShowjoins[room] = 1;
				}
				this.add(`||Join/leave messages in room ${room}: ALWAYS ON`);
			} else {
				serverShowjoins = { global: 1 };
				this.add(`||Join/leave messages: ALWAYS ON`);
			}
			showjoins[PS.server.id] = serverShowjoins;
			PS.prefs.set("showjoins", showjoins);
		},
		'hidejoins'(target) {
			let showjoins = PS.prefs.showjoins || {};
			let serverShowjoins = showjoins[PS.server.id] || {};
			if (target) {
				let room = toID(target);
				if (!serverShowjoins['global']) {
					delete serverShowjoins[room];
				} else {
					serverShowjoins[room] = 0;
				}
				this.add(`||Join/leave messages on room ${room}: OFF`);
			} else {
				serverShowjoins = { global: 0 };
				this.add(`||Join/leave messages: OFF`);
			}
			showjoins[PS.server.id] = serverShowjoins;
			PS.prefs.set('showjoins', showjoins);
		},
		'showdebug'() {
			PS.prefs.set('showdebug', true);
			this.add('||Debug battle messages: ON');
			PS.prefs.setShowDebug(true);
		},
		'hidedebug'() {
			PS.prefs.set('showdebug', false);
			this.add('||Debug battle messages: OFF');
			PS.prefs.setShowDebug(false);
		},
		'showbattles'() {
			PS.prefs.set('showbattles', true);
			this.add('||Battle Messages: ON');
		},
		'hidebattles'() {
			PS.prefs.set('showbattles', false);
			this.add('||Battle Messages: HIDDEN');
		},
		'afd'(target) {
			if (!target) return this.send('/help afd');
			let mode = toID(target);
			if (mode === 'sprites') {
				PS.prefs.set('afd', 'sprites');
				PS.prefs.setAFD('sprites');
				this.add('||April Fools\' Day mode set to SPRITES.');
			} else if (mode === 'off') {
				PS.prefs.set('afd', null);
				PS.prefs.setAFD();
				this.add('||April Fools\' Day mode set to OFF temporarily.');
				this.add('||Trying to turn it off permanently? Use /afd never');
			} else if (mode === 'default') {
				PS.prefs.setAFD();
				PS.prefs.set('afd', null);
				this.add('||April Fools\' Day mode set to DEFAULT (Currently ' + (Dex.afdMode ? 'FULL' : 'OFF') + ').');
			} else if (mode === 'full') {
				PS.prefs.set('afd', true);
				PS.prefs.setAFD(true);
				this.add('||April Fools\' Day mode set to FULL.');
			} else if (target === 'never') {
				PS.prefs.set('afd', false);
				PS.prefs.setAFD(false);
				this.add('||April Fools\' Day mode set to NEVER.');
				if (Config.server?.afd) {
					this.add('||You\'re using the AFD URL, which will still override this setting and enable AFD mode on refresh.');
				}
			} else {
				if (target) this.add('||AFD option "' + target + '" not recognized');
				let curMode = PS.prefs.afd as string | boolean;
				if (curMode === true) curMode = 'FULL';
				if (curMode === false) curMode = 'NEVER';
				if (curMode) curMode = curMode.toUpperCase();
				if (!curMode) curMode = 'DEFAULT (currently ' + (Dex.afdMode ? 'FULL' : 'OFF') + ')';
				this.add('||AFD is currently set to ' + mode);
				this.send('/help afd');
			}
			for (let roomid in PS.rooms) {
				let battle = PS.rooms[roomid] && (PS.rooms[roomid] as BattleRoom).battle;
				if (!battle) continue;
				battle.resetToCurrentTurn();
			}
		},
		'clearpms'() {
			let rooms = PS.miniRoomList.filter(roomid => roomid.startsWith('dm-'));
			if (!rooms.length) return this.add('||You do not have any PM windows open.');
			for (const roomid of rooms) {
				PS.leave(roomid);
			}
			this.add("||All PM windows cleared and closed.");
		},
		'unpackhidden'() {
			PS.prefs.set('nounlink', true);
			this.add('||Locked/banned users\' chat messages: ON');
		},
		'packhidden'() {
			PS.prefs.set('nounlink', false);
			this.add('||Locked/banned users\' chat messages: HIDDEN');
		},
		'hl,highlight'(target) {
			let highlights = PS.prefs.highlights || {};
			if (target.includes(' ')) {
				let targets = target.split(' ');
				let subCmd = targets[0];
				targets = targets.slice(1).join(' ').match(/([^,]+?({\d*,\d*})?)+/g) as string[];
				// trim the targets to be safe
				for (let i = 0, len = targets.length; i < len; i++) {
					targets[i] = targets[i].replace(/\n/g, '').trim();
				}
				switch (subCmd) {
				case 'add': case 'roomadd': {
					let key = subCmd === 'roomadd' ? (PS.server.id + '#' + this.id) : 'global';
					let highlightList = highlights[key] || [];
					for (let i = 0, len = targets.length; i < len; i++) {
						if (!targets[i]) continue;
						if (/[\\^$*+?()|{}[\]]/.test(targets[i])) {
							// Catch any errors thrown by newly added regular expressions so they don't break the entire highlight list
							try {
								new RegExp(targets[i]);
							} catch (e: any) {
								return this.add(`|error|${(e.message.substr(0, 28) === 'Invalid regular expression: ' ? e.message : 'Invalid regular expression: /' + targets[i] + '/: ' + e.message)}`);
							}
						}
						if (highlightList.includes(targets[i])) {
							return this.add(`|error|${targets[i]} is already on your highlights list.`);
						}
					}
					highlights[key] = highlightList.concat(targets);
					this.add(`||Now highlighting on ${(key === 'global' ? "(everywhere): " : "(in " + key + "): ")} ${highlights[key].join(', ')}`);
					// We update the regex
					ChatRoom.updateHighlightRegExp(highlights);
					break;
				}
				case 'delete': case 'roomdelete': {
					let key = subCmd === 'roomdelete' ? (PS.server.id + '#' + this.id) : 'global';
					let highlightList = highlights[key] || [];
					let newHls: string[] = [];
					for (let i = 0, len = highlightList.length; i < len; i++) {
						if (!targets.includes(highlightList[i])) {
							newHls.push(highlightList[i]);
						}
					}
					highlights[key] = newHls;
					this.add(`||Now highlighting on ${(key === 'global' ? "(everywhere): " : "(in " + key + "): ")} ${highlights[key].join(', ')}`);
					// We update the regex
					ChatRoom.updateHighlightRegExp(highlights);
					break;
				}
				default:
					// Wrong command
					this.errorReply('Invalid /highlight command.');
					this.handleSend('/help highlight'); // show help
					return;
				}
				PS.prefs.set('highlights', highlights);
			} else {
				if (['clear', 'roomclear', 'clearall'].includes(target)) {
					let key = (target === 'roomclear' ? (PS.server.id + '#' + this.id) : (target === 'clearall' ? '' : 'global'));
					if (key) {
						highlights[key] = [];
						this.add(`||All highlights (${(key === 'global' ? "everywhere" : "in " + key)}) cleared.`);
						ChatRoom.updateHighlightRegExp(highlights);
					} else {
						PS.prefs.set('highlights', null);
						this.add("||All highlights (in all rooms and globally) cleared.");
						ChatRoom.updateHighlightRegExp({});
					}
				} else if (['show', 'list', 'roomshow', 'roomlist'].includes(target)) {
					// Shows a list of the current highlighting words
					let key = target.startsWith('room') ? (PS.server.id + '#' + this.id) : 'global';
					if (highlights[key] && highlights[key].length > 0) {
						this.add(`||Current highlight list ${(key === 'global' ? "(everywhere): " : "(in " + key + "): ")}${highlights[key].join(", ")}`);
					} else {
						this.add(`||Your highlight list${(key === 'global' ? '' : ' in ' + key)} is empty.`);
					}
				} else {
					// Wrong command
					this.errorReply('Invalid /highlight command.');
					this.handleSend('/help highlight'); // show help
				}
			}
		},
		'senddirect'(target) {
			this.sendDirect(target);
		},
		'h,help'(target) {
			switch (toID(target)) {
			case 'chal':
			case 'chall':
			case 'challenge':
				this.add('||/challenge - Open a prompt to challenge a user to a battle.');
				this.add('||/challenge [user] - Challenge the user [user] to a battle.');
				this.add('||/challenge [user], [format] - Challenge the user [user] to a battle in the specified [format].');
				this.add('||/challenge [user], [format] @@@ [rules] - Challenge the user [user] to a battle with custom rules.');
				this.add('||[rules] can be a comma-separated list of: [added rule], ![removed rule], -[banned thing], *[restricted thing], +[unbanned/unrestricted thing]');
				this.add('||If used in the DMs of a user, no [user] parameter can be used and it will challenge that user.');
				this.add('||/battlerules - Detailed information on what can go in [rules].');
				return;
			case 'accept':
				this.add('||/accept - Accept a challenge if only one is pending.');
				this.add('||/accept [user] - Accept a challenge from the specified user.');
				return;
			case 'reject':
				this.add('||/reject - Reject a challenge if only one is pending.');
				this.add('||/reject [user] - Reject a challenge from the specified user.');
				return;
			case 'user':
			case 'open':
				this.add('||/user [user] - Open a popup containing the user [user]\'s avatar, name, rank, and chatroom list.');
				return;
			case 'news':
				this.add('||/news - Opens a popup containing the news.');
				return;
			case 'ignore':
			case 'unignore':
				this.add('||/ignore [user] - Ignore all messages from the user [user].');
				this.add('||/unignore [user] - Remove the user [user] from your ignore list.');
				this.add('||/ignorelist - List all the users that you currently ignore.');
				this.add('||/clearignore - Remove all users on your ignore list.');
				this.add('||Note that staff messages cannot be ignored.');
				return;
			case 'nick':
				this.add('||/nick [new username] - Change your username.');
				return;
			case 'clear':
				this.add('||/clear - Clear the room\'s chat log.');
				return;
			case 'showdebug':
			case 'hidedebug':
				this.add('||/showdebug - Receive debug messages from battle events.');
				this.add('||/hidedebug - Ignore debug messages from battle events.');
				return;
			case 'showjoins':
			case 'hidejoins':
				this.add('||/showjoins [room] - Receive users\' join/leave messages.');
				this.add('||/hidejoins [room] - Ignore users\' join/leave messages.');
				this.add('||If no [room] is provided, changes the global setting.');
				return;
			case 'showbattles':
			case 'hidebattles':
				this.add('||/showbattles - Receive links to new battles in Lobby.');
				this.add('||/hidebattles - Ignore links to new battles in Lobby.');
				return;
			case 'ffto':
			case 'fastforwardto':
				this.add('||/ffto [turn] - Skip to turn [turn] in the current battle.');
				this.add('||/ffto +[turn] - Skip forward [turn] turns.');
				this.add('||/ffto -[turn] - Skip backward [turn] turns.');
				this.add('||/ffto 0 - Skip to the start of the battle.');
				this.add('||/ffto end - Skip to the end of the battle.');
				return;
			case 'unpackhidden':
			case 'packhidden':
				this.add('||/unpackhidden - Suppress hiding locked or banned users\' chat messages after the fact.');
				this.add('||/packhidden - Hide locked or banned users\' chat messages after the fact.');
				this.add('||Hidden messages from a user can be restored by clicking the button underneath their lock/ban reason.');
				return;
			case 'timestamps':
				this.add('||Set your timestamps preference:');
				this.add('||/timestamps [all|lobby|pms], [minutes|seconds|off]');
				this.add('||all - Change all timestamps preferences, lobby - Change only lobby chat preferences, pms - Change only PM preferences.');
				this.add('||off - Set timestamps off, minutes - Show timestamps of the form [hh:mm], seconds - Show timestamps of the form [hh:mm:ss].');
				return;
			case 'highlight':
			case 'hl':
				this.add('||Set up highlights:');
				this.add('||/highlight add [word 1], [word 2], [...] - Add the provided list of words to your highlight list.');
				this.add('||/highlight roomadd [word 1], [word 2], [...] - Add the provided list of words to the highlight list of whichever room you used the command in.');
				this.add('||/highlight list - List all words that currently highlight you.');
				this.add('||/highlight roomlist - List all words that currently highlight you in whichever room you used the command in.');
				this.add('||/highlight delete [word 1], [word 2], [...] - Delete the provided list of words from your entire highlight list.');
				this.add('||/highlight roomdelete [word 1], [word 2], [...] - Delete the provided list of words from the highlight list of whichever room you used the command in.');
				this.add('||/highlight clear - Clear your global highlight list.');
				this.add('||/highlight roomclear - Clear the highlight list of whichever room you used the command in.');
				this.add('||/highlight clearall - Clear your entire highlight list (all rooms and globally).');
				return;
			case 'rank':
			case 'ranking':
			case 'rating':
			case 'ladder':
				this.add('||/rank [user] - Shows all ladder ranks for the given [user].');
				this.add('||/rank [user], [format] - Shows the rank of [user] in the given [format].');
				this.add('||If no user is given, it defaults to the user of the command.');
				return;
			case 'afd':
				this.add('||/afd full - Enable all April Fools\' Day jokes.');
				this.add('||/afd sprites - Enable April Fools\' Day sprites.');
				this.add('||/afd default - Set April Fools\' Day to default (full on April 1st, off otherwise).');
				this.add('||/afd off - Disable April Fools\' Day jokes until the next refresh, and set /afd default.');
				this.add('||/afd never - Disable April Fools\' Day jokes permanently.');
				return;
			default:
				return true;
			}
		},
		'autojoin,cmd,crq,query'() {
			this.errorReply(`This is a PS system command; do not use it.`);
		},
	});
	clientCommands: ParsedClientCommands | null = null;
	currentElement: HTMLElement | null = null;
	/**
	 * Handles outgoing messages, like `/logout`. Return `true` to prevent
	 * the line from being sent to servers.
	 */
	handleSend(line: string, element = this.currentElement) {
		if (!line.startsWith('/') || line.startsWith('//')) return line;
		const spaceIndex = line.indexOf(' ');
		const cmd = spaceIndex >= 0 ? line.slice(1, spaceIndex) : line.slice(1);
		// const target = spaceIndex >= 0 ? line.slice(spaceIndex + 1) : '';
		switch (cmd) {
		case 'logout': {
			PS.user.logOut();
			return true;
		}}
		return false;
	}
	send(msg: string, direct?: boolean) {
		if (!direct && !msg) return;
		if (!direct && this.handleMessage(msg)) return;

		PS.send(this.id + '|' + msg);
	}
	destroy() {
		if (this.connected) {
			this.send('/noreply /leave', true);
			this.connected = false;
		}
	}
}

class PlaceholderRoom extends PSRoom {
	queue = [] as Args[];
	readonly classType: 'placeholder' = 'placeholder';
	receiveLine(args: Args) {
		this.queue.push(args);
	}
}

/**********************************************************************
 * PS
 *********************************************************************/

type RoomType = {Model?: typeof PSRoom, Component: any, title?: string};

/**
 * This model updates:
 * - when a room is joined or left
 * - changing which room is focused
 * - changing the width of the left room, in two-panel mode
 */
const PS = new class extends PSModel {
	down: string | boolean = false;

	prefs = new PSPrefs();
	teams = new PSTeams();
	user = new PSUser();
	server = new PSServer();
	connection: PSConnection | null = null;
	connected = false;
	/**
	 * While PS is technically disconnected while it's trying to connect,
	 * it still shows UI like it's connected, so you can click buttons
	 * before the server connection is established.
	 *
	 * `isOffline` is only set if PS is neither connected nor trying to
	 * connect.
	 */
	isOffline = false;

	router: PSRouter = null!;

	rooms: {[roomid: string]: PSRoom | undefined} = {};
	roomTypes: {
		[type: string]: RoomType | undefined,
	} = {};
	/**
	 * If a route starts with `*`, it's a cached room location for the room placeholder.
	 * Otherwise, it's a RoomType ID.
	 *
	 * Routes are filled in by `PS.updateRoomTypes()` and do not need to be manually
	 * filled.
	 */
	routes: Record<string, string> = Object.assign(Object.create(null), {
		// locations cached here because it needs to be guessed before roomTypes is filled in
		// this cache is optional, but prevents some flickering during loading
		// to update:
		// console.log('\t\t' + JSON.stringify(Object.fromEntries(Object.entries(PS.routes).filter(([k, v]) => k !== 'dm-*').map(([k, v]) => [k, '*' + (PS.roomTypes[v].location || '')]))).replaceAll(',', ',\n\t\t').replaceAll('":"', '": "').slice(1, -1) + ',')
		"teambuilder": "*",
		"news": "*mini-window",
		"": "*",
		"rooms": "*right",
		"user-*": "*popup",
		"viewuser-*": "*popup",
		"volume": "*popup",
		"options": "*modal-popup",
		"*": "*right",
		"battle-*": "*",
		"battles": "*right",
		"teamdropdown": "*modal-popup",
		"formatdropdown": "*modal-popup",
		"team-*": "*",
		"ladder": "*",
		"ladder-*": "*",
		"view-*": "*",
		"login": "*modal-popup",
		"help-*": "*right",
		"tourpopout": "*modal-popup",
		"groupchat-*": "*right",
		"users": "*popup",
		"useroptions-*": "*popup",
		"userlist": "*modal-popup",
		"avatars": "*modal-popup",
		"changepassword": "*modal-popup",
		"register": "*modal-popup",
		"forfeitbattle": "*modal-popup",
		"replaceplayer": "*modal-popup",
		"changebackground": "*modal-popup",
		"confirmleaveroom": "*modal-popup",
		"chatformatting": "*modal-popup",
		"popup-*": "*modal-popup",
		"roomtablist": "*modal-popup",
		"battleoptions": "*modal-popup",
		"battletimer": "*modal-popup",
		"rules-*": "*modal-popup",
		"resources": "*",
		"game-*": "*",
		"teamstorage-*": "*modal-popup",
		"viewteam-*": "*",
	});
	/** List of rooms on the left side of the top tabbar */
	leftRoomList: RoomID[] = [];
	/** List of rooms on the right side of the top tabbar */
	rightRoomList: RoomID[] = [];
	/** List of mini-rooms in the Main Menu */
	miniRoomList: RoomID[] = [];
	/** Currently active popups, in stack order (bottom to top) */
	popups: RoomID[] = [];

	/**
	 * Currently active left room.
	 *
	 * In two-panel mode, this will be the visible left panel.
	 *
	 * In one-panel mode, this is the visible room only if it is
	 * `PS.room`. Still tracked when not visible, so we know which
	 * panels to display if PS is resized to two-panel mode.
	 */
	leftRoom: PSRoom = null!;
	/**
	 * Currently active right room.
	 *
	 * In two-panel mode, this will be the visible right panel.
	 *
	 * In one-panel mode, this is the visible room only if it is
	 * `PS.room`. Still tracked when not visible, so we know which
	 * panels to display if PS is resized to two-panel mode.
	 */
	rightRoom: PSRoom | null = null;
	/**
	 * The currently focused room. Should always be the topmost popup
	 * if it exists. If no popups are open, it should be
	 * `PS.activePanel`.
	 *
	 * Determines which room receives keyboard shortcuts.
	 *
	 * Clicking inside a panel will focus it, in two-panel mode.
	 */
	room: PSRoom = null!;
	/**
	 * The currently active panel. Should always be either `PS.leftRoom`
	 * or `PS.rightRoom`. If no popups are open, should be `PS.room`.
	 *
	 * In one-panel mode, determines whether the left or right panel is
	 * visible.
	 */
	activePanel: PSRoom = null!;
	/**
	 * Not to be confused with PSPrefs.onepanel, which is permanent.
	 * PS.onePanelMode will be true if one-panel mode is on, but it will
	 * also be true if the right panel is temporarily hidden (by opening
	 * the Rooms panel and clicking "Hide")
	 *
	 * Will NOT be true if only one panel fits onto the screen at the
	 * moment, but resizing will display multiple panels – for that,
	 * check `PS.leftRoomWidth === 0`
	 */
	onePanelMode = false;
	/**
	 * 0 = only one panel visible.
	 * n.b. PS will only update if the left room width changes. Resizes
	 * that don't change the left room width will not trigger an update.
	 */
	leftRoomWidth = 0;
	mainmenu: MainMenuRoom = null!;

	/**
	 * The drag-and-drop API is incredibly dumb and doesn't let us know
	 * what's being dragged until the `drop` event, so we track it here.
	 *
	 * Note that `PS.dragging` will be null if the drag was initiated
	 * outside PS (e.g. dragging a team from File Explorer to PS), and
	 * for security reasons it's impossible to know what they are until
	 * they're dropped.
	 */
	dragging: {type: 'room', roomid: RoomID} | null = null;

	/** Tracks whether or not to display the "Use arrow keys" hint */
	arrowKeysUsed = false;

	newsHTML = document.querySelector('.news-embed .pm-log')?.innerHTML || '';

	constructor() {
		super();

		this.addRoom({
			id: '' as RoomID,
			title: "Home",
		});

		this.addRoom({
			id: 'rooms' as RoomID,
			title: "Rooms",
		});

		if (this.newsHTML) {
			this.addRoom({
				id: 'news' as RoomID,
				title: "News",
			});
		}

		// Create rooms before /autojoin is sent to the server
		let autojoin = this.prefs.autojoin;
		if (autojoin) {
			if (typeof autojoin === 'string') {
				autojoin = { showdown: autojoin };
			}
			let rooms = autojoin[this.server.id] || '';
			for (let title of rooms.split(",")) {
				const id = /[^a-z0-9-]/.test(title) ? toID(title) as any as RoomID : title as RoomID;
				this.addRoom({ id, title, connected: true, autofocus: false });
			}
		}

		// for old versions of Safari
		if (window.webkitNotification) {
			window.Notification ||= window.webkitNotification;
		}

		this.updateLayout();
		window.addEventListener('resize', () => this.updateLayout());
	}

	// Panel layout
	///////////////
	/**
	 * "minWidth" and "maxWidth" are a bit deceptive here - to be clear,
	 * all PS rooms are expected to responsively support any width from
	 * 320px up, when in single panel mode. These metrics are used purely
	 * to calculate the location of the separator in two-panel mode.
	 *
	 * - `minWidth` - minimum width as a right-panel
	 * - `width` - preferred width, minimum width as a left-panel
	 * - `maxWidth` - maximum width as a left-panel
	 *
	 * PS will only show two panels if it can fit `width` in the left, and
	 * `minWidth` in the right. Extra space will be given to to right panel
	 * until it reaches `width`, then evenly distributed until both panels
	 * reach `maxWidth`, and extra space above that will be given to the
	 * right panel.
	 */
	getWidthFor(room: PSRoom) {
		switch (room.type) {
		case 'mainmenu':
			return {
				minWidth: 340,
				width: 628,
				maxWidth: 628,
				isMainMenu: true,
			};
		case 'chat':
		case 'rooms':
		case 'battles':
			return {
				minWidth: 320,
				width: 570,
				maxWidth: 640,
			};
		case 'battle':
			return {
				minWidth: 320,
				width: 956,
				maxWidth: 1180,
			};
		}
		return {
			minWidth: 640,
			width: 640,
			maxWidth: 640,
		};
	}
	updateLayout(alreadyUpdating?: boolean) {
		const leftRoomWidth = this.calculateLeftRoomWidth();
		let roomHeight = document.body.offsetHeight - 56;
		let totalWidth = document.body.offsetWidth;
		if (leftRoomWidth) {
			this.leftRoom.width = leftRoomWidth;
			this.leftRoom.height = roomHeight;
			this.rightRoom!.width = totalWidth + 1 - leftRoomWidth;
			this.rightRoom!.height = roomHeight;
		} else {
			this.activePanel.width = totalWidth;
			this.activePanel.height = roomHeight;
		}

		if (this.leftRoomWidth !== leftRoomWidth) {
			this.leftRoomWidth = leftRoomWidth;
			if (!alreadyUpdating) this.update(true);
		}
	}
	update(layoutAlreadyUpdated?: boolean) {
		if (!layoutAlreadyUpdated) this.updateLayout(true);
		super.update();
	}
	receive(msg: string) {
		msg = msg.endsWith('\n') ? msg.slice(0, -1) : msg;
		let roomid = '' as RoomID;
		if (msg.startsWith('>')) {
			const nlIndex = msg.indexOf('\n');
			roomid = msg.slice(1, nlIndex) as RoomID;
			msg = msg.slice(nlIndex + 1);
		}
		const roomid2 = roomid || 'lobby' as RoomID;
		let room = PS.rooms[roomid];
		console.log('\u2705 ' + (roomid ? '[' + roomid + '] ' : '') + '%c' + msg, "color: #007700");
		let isInit = false;
		for (const line of msg.split('\n')) {
			const args = BattleTextParser.parseLine(line);
			switch (args[0]) {
			case 'init': {
				isInit = true;
				room = PS.rooms[roomid2];
				const [, type] = args;
				if (!room) {
					this.addRoom({
						id: roomid2,
						type,
						connected: true,
						autofocus: roomid !== 'staff' && roomid !== 'upperstaff',
						// probably the only use for `autoclosePopups: false`.
						// (the server sometimes sends a popup error message and a new room at the same time)
						autoclosePopups: false,
					});
					if (room && type === 'battle') {
						(room as BattleRoom).rejoining = msg.includes('\n|start\n');
					}
				} else {
					room.type = type;
					room.connected = true;
					this.updateRoomTypes();
				}
				this.update();
				continue;
			} case 'deinit': {
				room = PS.rooms[roomid2];
				if (room) {
					room.connected = false;
					this.removeRoom(room);
				}
				this.update();
				continue;
			} case 'noinit': {
				room = PS.rooms[roomid2];
				if (room) {
					room.connected = false;
					if (args[1] === 'namerequired') {
						room.connectWhenLoggedIn = true;
						if (!PS.user.initializing) {
							room.receiveLine(['error', args[2]]);
						}
					} else if (args[1] === 'nonexistent' || args[1] === 'joinfailed') {
						// sometimes we assume a room is a chatroom when it's not
						// when that happens, just ignore this error
						if (room.type === 'chat' || room.type === 'battle') room.receiveLine(args);
					} else if (args[1] === 'rename') {
						room.connected = true;
						room.title = args[3] || room.title;
						this.renameRoom(room, args[2] as RoomID);
					}
				}
				this.update();
				continue;
			} case 'nametaken': {
				PS.join('login' as RoomID, { args: { error: `Someone is already using the name ${args[1]}.` } });
				break;
			} case 'chat': case 'c': {
				if (args[1] === '~' && (args[2] + ' ').startsWith('/warn ')) {
					PS.join(`rules-warn` as RoomID, {
						args: {
							type: 'warn',
							message: args[2].slice(6).trim() || undefined,
						},
						parentElem: null,
					});
					continue;
				}
			}

			}
			room?.receiveLine(args);
		}
		if (room) room.update(isInit ? [`initdone`] : null);
	}
	send(fullMsg: string) {
		const pipeIndex = fullMsg.indexOf('|');
		const roomid = fullMsg.slice(0, pipeIndex) as RoomID;
		const msg = fullMsg.slice(pipeIndex + 1);
		console.log('\u25b6\ufe0f ' + (roomid ? '[' + roomid + '] ' : '') + '%c' + msg, "color: #776677");
		if (!this.connection) {
			alert(`You are not connected and cannot send ${msg}.`);
			return;
		}
		this.connection.send(fullMsg);
	}
	isVisible(room: PSRoom): boolean {
		if (PS.isPanel(room)) {
			return !this.leftPanelWidth ? room === this.panel : room === this.leftPanel || room === this.rightPanel;
		}
		if (room.location === 'mini-window') {
			return !this.leftPanelWidth ? this.mainmenu === this.panel : this.mainmenu === this.leftPanel;
		}
		// some kind of popup
		return true;
	}
	isVisiblePanel(room: PSRoom) {
		if (!this.leftPanelWidth) {
			// one panel visible
			return room === this.room;
		} else {
			// both panels visible
			return room === this.rightRoom || room === this.leftRoom;
		}
	}
	calculateLeftRoomWidth() {
		// If we don't have both a left room and a right room, obviously
		// just show one room
		if (!this.leftRoom || !this.rightRoom || this.onePanelMode) {
			return 0;
		}

		// The rest of this code can assume we have both a left room and a
		// right room, and also want to show both if they fit

		const left = this.getWidthFor(this.leftRoom);
		const right = this.getWidthFor(this.rightRoom);
		const available = document.body.offsetWidth;

		let excess = available - (left.width + right.width);
		if (excess >= 0) {
			// both fit in full size
			const leftStretch = left.maxWidth - left.width;
			if (!leftStretch) return left.width;
			const rightStretch = right.maxWidth - right.width;
			if (leftStretch + rightStretch >= excess) return left.maxWidth;
			// evenly distribute the excess
			return left.width + Math.floor(excess * leftStretch / (leftStretch + rightStretch));
		}

		if (left.isMainMenu) {
			if (available >= left.minWidth + right.width) {
				return left.minWidth;
			}
			return 0;
		}

		if (available >= left.width + right.minWidth) {
			return left.width;
		}
		return 0;
	}
	createRoom(options: RoomOptions) {
		// type/side not defined in roomTypes because they need to be guessed before the types are loaded
		if (!options.type) {
			const hyphenIndex = options.id.indexOf('-');
			switch (hyphenIndex < 0 ? options.id : options.id.slice(0, hyphenIndex + 1)) {
			case 'teambuilder': case 'ladder': case 'battles': case 'rooms':
			case 'options': case 'volume': case 'teamdropdown': case 'formatdropdown':
			case 'news':
				options.type = options.id;
				break;
			case 'battle-': case 'user-': case 'team-': case 'ladder-':
				options.type = options.id.slice(0, hyphenIndex);
				break;
			case 'view-':
				options.type = 'html';
				break;
			case '':
				options.type = 'mainmenu';
				break;
			default:
				options.type = 'chat';
				break;
			}
		}

		if (!options.location) {
			switch (options.type) {
			case 'rooms':
			case 'chat':
				options.location = 'right';
				break;
			case 'options':
			case 'volume':
			case 'user':
				options.location = 'popup';
				break;
			case 'teamdropdown':
			case 'formatdropdown':
				options.location = 'semimodal-popup';
				break;
			case 'news':
				options.location = 'mini-window';
				break;
			}
			if (options.id.startsWith('pm-')) options.location = 'mini-window';
		}

		const roomType = this.roomTypes[options.type];
		if (roomType?.title) options.title = roomType.title;
		const Model = roomType ? (roomType.Model || PSRoom) : PlaceholderRoom;
		return new Model(options);
	}
	updateRoomTypes() {
		let updated = false;
		for (const roomid in this.rooms) {
			const room = this.rooms[roomid]!;
			if (room.type === room.classType) continue;
			const roomType = this.roomTypes[room.type];
			if (!roomType) continue;

			const options: RoomOptions = room;
			if (roomType.title) options.title = roomType.title;
			const Model = roomType.Model || PSRoom;
			const newRoom = new Model(options);
			this.rooms[roomid] = newRoom;
			if (this.leftRoom === room) this.leftRoom = newRoom;
			if (this.rightRoom === room) this.rightRoom = newRoom;
			if (this.activePanel === room) this.activePanel = newRoom;
			if (this.room === room) this.room = newRoom;
			if (roomid === '') this.mainmenu = newRoom as MainMenuRoom;

			if (options.queue) {
				for (const args of options.queue) {
					room.receiveLine(args);
				}
			}
			updated = true;
		}
		if (updated) this.update();
	}
	focusRoom(roomid: RoomID) {
		const room = this.rooms[roomid];
		if (!room) return false;
		if (this.room === room) {
			this.setFocus(room);
			return true;
		}
		this.closePopupsAbove(room, true);
		if (!this.isVisiblePanel(room)) {
			room.focusNextUpdate = true;
		}
		if (PS.isPanel(room)) {
			if (room.location === 'right') {
				this.rightPanel = room;
			} else {
				this.leftPanel = room;
			}
			this.panel = this.room = room;
		} else { // popup or mini-window
			if (room.location === 'mini-window') {
				this.leftPanel = this.panel = PS.mainmenu;
			}
			this.room = room;
		}
		this.room.autoDismissNotifications();
		this.update();
		this.room.onParentEvent?.('focus', undefined);
		return true;
	}
	focusLeftRoom() {
		const allRooms = this.leftRoomList.concat(this.rightRoomList);
		let roomIndex = allRooms.indexOf(this.room.id);
		if (roomIndex === -1) {
			// inconsistent state: should not happen
			return this.focusRoom('' as RoomID);
		}
		if (roomIndex === 0) {
			return this.focusRoom(allRooms[allRooms.length - 1]);
		}
		return this.focusRoom(allRooms[roomIndex - 1]);
	}
	focusRightRoom() {
		const allRooms = this.leftRoomList.concat(this.rightRoomList);
		let roomIndex = allRooms.indexOf(this.room.id);
		if (roomIndex === -1) {
			// inconsistent state: should not happen
			return this.focusRoom('' as RoomID);
		}
		if (roomIndex === allRooms.length - 1) {
			return this.focusRoom(allRooms[0]);
		}
		return this.focusRoom(allRooms[roomIndex + 1]);
	}
	focusPreview(room: PSRoom) {
		if (room !== this.room) return '';
		const allRooms = this.leftRoomList.concat(this.rightRoomList);
		let roomIndex = allRooms.indexOf(this.room.id);
		if (roomIndex === -1) {
			// inconsistent state: should not happen
			return '';
		}
		let buf = '  ';
		if (roomIndex > 1) { // don't show Home
			const leftRoom = this.rooms[allRooms[roomIndex - 1]]!;
			buf += `\u2190 ${leftRoom.title}`;
		}
		buf += (this.arrowKeysUsed ? " | " : " (use arrow keys) ");
		if (roomIndex < allRooms.length - 1) {
			const rightRoom = this.rooms[allRooms[roomIndex + 1]]!;
			buf += `${rightRoom.title} \u2192`;
		}
		return buf;
	}
	getPMRoom(userid: ID) {
		const myUserid = PS.user.userid;
		const roomid = `pm-${[userid, myUserid].sort().join('-')}` as RoomID;
		if (this.rooms[roomid]) return this.rooms[roomid] as ChatRoom;
		this.join(roomid);
		return this.rooms[roomid] as ChatRoom;
	}
	addRoom(options: RoomOptions, noFocus?: boolean) {
		// support hardcoded PM room-IDs
		if (options.id.startsWith('challenge-')) {
			options.id = `pm-${options.id.slice(10)}` as RoomID;
			options.challengeMenuOpen = true;
		}
		if (options.id.startsWith('pm-') && options.id.indexOf('-', 3) < 0) {
			const userid1 = PS.user.userid;
			const userid2 = options.id.slice(3);
			options.id = `pm-${[userid1, userid2].sort().join('-')}` as RoomID;
		}
		if (options.id.startsWith('battle-') && PS.prefs.rightpanelbattles) options.location = 'right';
		if (options.id.startsWith('help-')) {
			options.location = 'right';
			options.type = 'chat';
		}
		options.parentRoomid ??= this.getRoom(options.parentElem)?.id;
		const parentRoom = options.parentRoomid ? this.rooms[options.parentRoomid] : null;
		let preexistingRoom = this.rooms[options.id];
		if (preexistingRoom && this.isPopup(preexistingRoom)) {
			const sameOpener = (preexistingRoom.parentElem === options.parentElem);
			this.closePopupsAbove(parentRoom, true);
			if (sameOpener) return;
			preexistingRoom = this.rooms[options.id];
		}
		if (preexistingRoom) {
			if (options.args?.format) {
				preexistingRoom.args = options.args;
				if ((preexistingRoom as ChatRoom).challengeMenuOpen) {
					options.args.format = `!!${options.args.format as string}`;
				}
			}
			if (!noFocus) {
				if (options.challengeMenuOpen) {
					(this.rooms[options.id] as ChatRoom).openChallenge();
				}
				this.focusRoom(options.id);
			}
			return;
		}
		if (!noFocus) {
			while (this.popups.length && this.popups[this.popups.length - 1] !== options.parentRoomid) {
				const popupid = this.popups.pop()!;
				this.leave(popupid);
			}
		}
		const room = this.createRoom(options);
		this.rooms[room.id] = room;
		const location = room.location;
		room.location = null!;
		this.moveRoom(room, location, !options.autofocus);
		if (options.backlog) {
			for (const args of options.backlog) {
				room.receiveLine(args);
			}
		}
		if (options.autofocus) room.focusNextUpdate = true;
		return room;
	}
	hideRightRoom() {
		if (PS.rightPanel) {
			if (PS.panel === PS.rightPanel) PS.panel = PS.leftPanel;
			if (PS.room === PS.rightPanel) PS.room = PS.leftPanel;
			PS.rightPanel = null;
			PS.update();
			PS.focusRoom(PS.leftPanel.id);
		}
	}
	renameRoom(room: PSRoom, id: RoomID) {
		// should never happen
		if (this.rooms[id]) this.removeRoom(this.rooms[id]);

		const oldid = room.id;
		room.id = id;
		this.rooms[id] = room;
		delete this.rooms[oldid];

		const popupIndex = this.popups.indexOf(oldid);
		if (popupIndex >= 0) this.popups[popupIndex] = id;
		const leftRoomIndex = this.leftRoomList.indexOf(oldid);
		if (leftRoomIndex >= 0) this.leftRoomList[leftRoomIndex] = id;
		const rightRoomIndex = this.rightRoomList.indexOf(oldid);
		if (rightRoomIndex >= 0) this.rightRoomList[rightRoomIndex] = id;
		const miniRoomIndex = this.miniRoomList.indexOf(oldid);
		if (miniRoomIndex >= 0) this.miniRoomList[miniRoomIndex] = id;

		this.update();
	}
	isPopup(room: PSRoom | undefined | null) {
		if (!room) return false;
		return room.location === 'popup' || room.location === 'modal-popup';
	}
	/** this isn't just !isPopup. you forgot about mini windows again. */
	isPanel(room: PSRoom | undefined | null) {
		if (!room) return false;
		return room.location === 'left' || room.location === 'right';
	}
	moveRoom(room: PSRoom, location: PSRoomLocation, background?: boolean, index?: number) {
		if (room.location === location && index === undefined) {
			if (background === true) {
				if (room === this.leftPanel) {
					this.leftPanel = this.mainmenu;
					this.panel = this.mainmenu;
				} else if (room === this.rightPanel) {
					this.rightPanel = this.rooms['rooms'] || null;
					this.panel = this.rightPanel || this.leftPanel;
				}
			} else if (background === false) {
				this.focusRoom(room.id);
			}
			return;
		}
		if (this.isPopup(room) && (location === 'popup' || location === 'modal-popup')) {
			room.location = location;
			return;
		}

		background ??= !this.isVisible(room);

		if (room.location === 'mini-window') {
			const miniRoomIndex = this.miniRoomList.indexOf(room.id);
			if (miniRoomIndex >= 0) {
				this.miniRoomList.splice(miniRoomIndex, 1);
			}
			if (this.room === room) this.room = this.panel;
		} else if (room.location === 'popup' || room.location === 'modal-popup') {
			const popupIndex = this.popups.indexOf(room.id);
			if (popupIndex >= 0) {
				this.popups.splice(popupIndex, 1);
			}
			if (this.room === room) this.room = this.panel;
		} else if (room.location === 'left') {
			const leftRoomIndex = this.leftRoomList.indexOf(room.id);
			if (leftRoomIndex >= 0) {
				this.leftRoomList.splice(leftRoomIndex, 1);
			}
			if (this.room === room) this.room = this.mainmenu;
			if (this.panel === room) this.panel = this.mainmenu;
			if (this.leftPanel === room) this.leftPanel = this.mainmenu;
		} else if (room.location === 'right') {
			const rightRoomIndex = this.rightRoomList.indexOf(room.id);
			if (rightRoomIndex >= 0) {
				this.rightRoomList.splice(rightRoomIndex, 1);
			}
			if (this.room === room) this.room = this.rooms['rooms'] || this.leftPanel;
			if (this.panel === room) this.panel = this.rooms['rooms'] || this.leftPanel;
			if (this.rightPanel === room) this.rightPanel = this.rooms['rooms'] || null;
		}

		room.location = location;
		switch (location) {
		case 'left':
			this.leftRoomList.push(room.id);
			if (!noFocus) this.leftRoom = room;
			break;
		case 'right':
			this.rightRoomList.push(room.id);
			if (this.rightRoomList[this.rightRoomList.length - 2] === 'rooms') {
				this.rightRoomList.splice(-2, 1);
				this.rightRoomList.push('rooms' as RoomID);
			}
			if (!noFocus || !this.rightRoom) this.rightRoom = room;
			break;
		case 'mini-window':
			this.miniRoomList.push(room.id);
			break;
		case 'popup':
		case 'modal-popup':
			this.popups.push(room.id);
			break;
		}
		if (!noFocus) {
			if (!this.popups.length) this.activePanel = room;
			this.room = room;
		}
		if (options.queue) {
			for (const args of options.queue) {
				room.receiveLine(args);
			}
		}
		return room;
	}
	removeRoom(room: PSRoom) {
		room.destroy();
		delete PS.rooms[room.id];

		const leftRoomIndex = PS.leftRoomList.indexOf(room.id);
		if (leftRoomIndex >= 0) {
			PS.leftRoomList.splice(leftRoomIndex, 1);
		}
		if (PS.leftRoom === room) {
			PS.leftRoom = this.mainmenu;
			if (PS.activePanel === room) PS.activePanel = this.mainmenu;
			if (PS.room === room) PS.room = this.mainmenu;
		}

		const rightRoomIndex = PS.rightRoomList.indexOf(room.id);
		if (rightRoomIndex >= 0) {
			PS.rightRoomList.splice(rightRoomIndex, 1);
		}
		if (PS.rightRoom === room) {
			let newRightRoomid = PS.rightRoomList[rightRoomIndex] || PS.rightRoomList[rightRoomIndex - 1];
			PS.rightRoom = newRightRoomid ? PS.rooms[newRightRoomid]! : null;
			if (PS.activePanel === room) PS.activePanel = PS.rightRoom || PS.leftRoom;
			if (PS.room === room) PS.room = PS.activePanel;
		}

		if (room.location === 'mini-window') {
			const miniRoomIndex = PS.miniRoomList.indexOf(room.id);
			if (miniRoomIndex >= 0) {
				PS.miniRoomList.splice(miniRoomIndex, 1);
			}
		}

		if (this.popups.length && room.id === this.popups[this.popups.length - 1]) {
			this.popups.pop();
			PS.room = this.popups.length ? PS.rooms[this.popups[this.popups.length - 1]]! : PS.activePanel;
		}

		this.update();
	}
	closePopup(skipUpdate?: boolean) {
		if (!this.popups.length) return;
		this.leave(this.popups[this.popups.length - 1]);
		if (!skipUpdate) this.update();
	}
	join(roomid: RoomID, side?: PSRoomLocation | null, noFocus?: boolean) {
		if (this.room.id === roomid) return;
		this.addRoom({id: roomid, side}, noFocus);
		this.update();
	}
	leave(roomid: RoomID) {
		const room = PS.rooms[roomid];
		if (room) {
			this.removeRoom(room);
			if (room.type === 'chat') this.updateAutojoin();
			this.update();
		}
	}

	updateAutojoin() {
		if (!PS.server.registered) return;
		let autojoins: string[] = [];
		let autojoinCount = 0;
		let rooms = this.rightRoomList;
		for (let roomid of rooms) {
			let room = PS.rooms[roomid] as ChatRoom;
			if (!room) return;
			if (room.type !== 'chat' || room.pmTarget) continue;
			autojoins.push(room.id.includes('-') ? room.id : (room.title || room.id));
			if (room.id === 'staff' || room.id === 'upperstaff' || (PS.server.id !== 'showdown' && room.id === 'lobby')) continue;
			autojoinCount++;
			if (autojoinCount >= 15) break;
		}

		const thisAutojoin = autojoins.join(',') || null;
		let autojoin = this.prefs.autojoin || null;
		if (this.server.id === 'showdown' && typeof autojoin !== 'object') {
			// Main server only mode
			if (autojoin === thisAutojoin) return;

			this.prefs.set('autojoin', thisAutojoin || null);
		} else {
			// Multi server mode
			autojoin = typeof autojoin === 'string' ? { showdown: autojoin } : autojoin || {};
			if (autojoin[this.server.id] === thisAutojoin) return;

			autojoin[this.server.id] = thisAutojoin || '';
			this.prefs.set('autojoin', autojoin);
		}
	}
	requestNotifications() {
		try {
			if (window.webkitNotifications?.requestPermission) {
				// Notification.requestPermission crashes Chrome 23:
				//   https://code.google.com/p/chromium/issues/detail?id=139594
				// In lieu of a way to detect Chrome 23, we'll just use the old
				// requestPermission API, which works to request permissions for
				// the new Notification spec anyway.
				window.webkitNotifications.requestPermission();
			} else if (window.Notification) {
				Notification.requestPermission?.(permission => {});
			}
		} catch {}
	}
	playNotificationSound() {
		if (window.BattleSound && !this.prefs.mute) {
			window.BattleSound.playSound('audio/notification.wav', this.prefs.notifvolume);
		}
	}
};
