/**
 * Battle panel
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 */

type BattleDesc = {
	id: RoomID,
	minElo?: number | string,
	p1?: string,
	p2?: string,
	p3?: string,
	p4?: string,
};

class BattlesRoom extends PSRoom {
	override readonly classType = 'battles';
	/** null means still loading */
	format = '';
	battles: BattleDesc[] | null = null;
	constructor(options: RoomOptions) {
		super(options);
		this.refresh();
	}
	setFormat(format: string) {
		if (format === this.format) return this.refresh();
		this.battles = null;
		this.format = format;
		this.update(null);
		this.refresh();
	}
	refresh() {
		PS.send(`|/cmd roomlist ${toID(this.format)}`);
	}
}

class BattlesPanel extends PSRoomPanel<BattlesRoom> {
	refresh = () => {
		this.props.room.refresh();
	};
	changeFormat = (e: Event) => {
		const value = (e.target as HTMLButtonElement).value;
		this.props.room.setFormat(value);
	};
	renderBattleLink(battle: BattleDesc) {
		const format = battle.id.split('-')[1];
		const minEloMessage = typeof battle.minElo === 'number' ? `rated ${battle.minElo}` : battle.minElo;
		return <div><a href={`/${battle.id}`} class="blocklink">
			{minEloMessage && <small style="float:right">({minEloMessage})</small>}
			<small>[{format}]</small><br />
			<em class="p1">{battle.p1}</em> <small class="vs">vs.</small> <em class="p2">{battle.p2}</em>
		</a></div>;
	}
	render() {
		const room = this.props.room;
		return <PSPanelWrapper room={room}><div class="pad">
			<button class="button" style="float:right;font-size:10pt;margin-top:3px" name="closeRoom">
				<i class="fa fa-times" aria-hidden></i> Close
			</button>
			<div class="roomlist">
				<p>
					<button class="button" name="refresh" onClick={this.refresh}><i class="fa fa-refresh"></i> Refresh</button> <span style={Dex.getPokemonIcon('meloetta-pirouette') + ';display:inline-block;vertical-align:middle'} class="picon" title="Meloetta is PS's mascot! The Pirouette forme is Fighting-type, and represents our battles."></span>
				</p>

				<p>
					<label class="label">Format:</label><FormatDropdown onChange={this.changeFormat} />
				</p>
				{/* <label>Minimum Elo: <select name="elofilter"><option value="none">None</option><option value="1100">1100</option><option value="1300">1300</option><option value="1500">1500</option><option value="1700">1700</option><option value="1900">1900</option></select></label>

				<form class="search">
					<p>
						<input type="text" name="prefixsearch" class="textbox" placeholder="Username prefix"/><button type="submit" class="button">Search</button>
					</p>
				</form> */}
				<div class="list">{!room.battles ?
					<p>Loading...</p>
				: !room.battles.length ?
					<p>No battles are going on</p>
				:
					room.battles.map(battle => this.renderBattleLink(battle))
				}</div>
			</div>
		</div></PSPanelWrapper>;
	}
}

class BattleRoom extends ChatRoom {
	override readonly classType = 'battle';
	declare pmTarget: null;
	declare challengeMenuOpen: false;
	declare challengingFormat: null;
	declare challengedFormat: null;

	battle: Battle = null!;
	/** null if spectator, otherwise current player's info */
	side: BattleRequestSideInfo | null = null;
	request: BattleRequest | null = null;
	choices: BattleChoiceBuilder | null = null;
	autoTimerActivated: boolean | null = null;
	/** should be false if we joined right after accepting or challenging a battle,
	  * and true if we refreshed and rejoined a battle.
		* null = initializing, we don't know yet */
	rejoining: boolean | null = null;

	loadReplay() {
		const replayid = this.id.slice(7);
		Net(`https://replay.pokemonshowdown.com/${replayid}.json`).get().catch(() => '').then(data => {
			try {
				const replay = JSON.parse(data);
				this.title = `[${replay.format}] ${replay.players.join(' vs. ')}`;
				this.battle.stepQueue = replay.log.split('\n');
				this.battle.atQueueEnd = false;
				this.battle.pause();
				this.battle.seekTurn(0);
				this.connected = 'client-only';
				this.update(null);
			} catch {
				this.receiveLine(['bigerror', `Battle "${replayid}" not found`]);
				this.receiveLine(['html',
					`<div class="broadcast-red pad"><p class="buttonbar"><button class="button" data-cmd="/close"><strong>Close</strong></button></p></div>`,
				]);
			}
			if (isNaN(turnNum)) {
				this.receiveLine([`error`, `/ffto - Invalid turn number: ${target}`]);
				return true;
			}
			this.battle.seekTurn(turnNum);
			this.update(null);
			return true;
		} case 'switchsides': {
			this.battle.switchViewpoint();
			return true;
		} case 'cancel': case 'undo': {
			if (!this.choices || !this.request) {
				this.receiveLine([`error`, `/choose - You are not a player in this battle`]);
				return true;
			}
			if (this.choices.isDone() || this.choices.isEmpty()) {
				this.send('/undo', true);
			}
			this.choices = new BattleChoiceBuilder(this.request);
			this.update(null);
			return true;
		} case 'move': case 'switch': case 'team': case 'pass': case 'shift': case 'choose': {
			if (!this.choices) {
				this.receiveLine([`error`, `/choose - You are not a player in this battle`]);
				return true;
			}
			const possibleError = this.choices.addChoice(line.slice(cmd === 'choose' ? 8 : 1));
			if (possibleError) {
				this.receiveLine([`error`, possibleError]);
				return true;
			}
			if (this.choices.isDone()) this.send(`/choose ${this.choices.toString()}`, true);
			this.update(null);
			return true;
		}}
		return super.handleMessage(line);
	}
}

class BattleDiv extends preact.Component {
	shouldComponentUpdate() {
		return false;
	}
	render() {
		return <div class="battle"></div>;
	}
}

function MoveButton(props: {
	children: string, cmd: string, moveData: {pp: number, maxpp: number}, type: TypeName, tooltip: string,
}) {
	return <button name="cmd" value={props.cmd} class={`type-${props.type} has-tooltip`} data-tooltip={props.tooltip}>
		{props.children}<br />
		<small class="type">{props.type}</small> <small class="pp">{props.moveData.pp}/{props.moveData.maxpp}</small>&nbsp;
	</button>;
}
function PokemonButton(props: {
	pokemon: Pokemon | ServerPokemon | null, cmd: string, noHPBar?: boolean, disabled?: boolean | 'fade', tooltip: string,
}) {
	const pokemon = props.pokemon;
	if (!pokemon) {
		return <button
			name="cmd" value={props.cmd} class={`${props.disabled ? 'disabled ' : ''}has-tooltip`}
			style={{opacity: props.disabled === 'fade' ? 0.5 : 1}} data-tooltip={props.tooltip}
		>
			(empty slot)
		</button>;
	}

	let hpColorClass;
	switch (BattleScene.getHPColor(pokemon)) {
	case 'y': hpColorClass = 'hpbar hpbar-yellow'; break;
	case 'r': hpColorClass = 'hpbar hpbar-red'; break;
	default: hpColorClass = 'hpbar'; break;
	}

	return <button
		name="cmd" value={props.cmd} class={`${props.disabled ? 'disabled ' : ''}has-tooltip`}
		style={{opacity: props.disabled === 'fade' ? 0.5 : 1}} data-tooltip={props.tooltip}
	>
		<span class="picon" style={Dex.getPokemonIcon(pokemon)}></span>
		{pokemon.name}
		{
			!props.noHPBar && !pokemon.fainted &&
			<span class={hpColorClass}>
				<span style={{width: Math.round(pokemon.hp * 92 / pokemon.maxhp) || 1}}></span>
			</span>
		}
		{!props.noHPBar && pokemon.status && <span class={`status ${pokemon.status}`}></span>}
	</button>;
}

class BattlePanel extends PSRoomPanel<BattleRoom> {
	send = (text: string) => {
		this.props.room.send(text);
	};
	focus() {
		this.base!.querySelector('textarea')!.focus();
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
	toggleBoostedMove = (e: Event) => {
		const checkbox = e.currentTarget as HTMLInputElement;
		const choices = this.props.room.choices;
		if (!choices) return; // shouldn't happen
		switch (checkbox.name) {
		case 'mega':
			choices.current.mega = checkbox.checked;
			break;
		case 'megax':
			choices.current.megax = checkbox.checked;
			choices.current.megay = false;
			break;
		case 'megay':
			choices.current.megay = checkbox.checked;
			choices.current.megax = false;
			break;
		case 'ultra':
			choices.current.ultra = checkbox.checked;
			break;
		case 'z':
			choices.current.z = checkbox.checked;
			break;
		case 'max':
			choices.current.max = checkbox.checked;
			break;
		}
		this.props.room.update(null);
	};
	componentDidMount() {
		const $elem = $(this.base!);
		const battle = new Battle({
			$frame: $elem.find('.battle'),
			$logFrame: $elem.find('.battle-log'),
		});
		this.props.room.battle = battle;
		(battle.scene as BattleScene).tooltips.listen($elem.find('.battle-controls'));
		super.componentDidMount();
		if (!PS.prefs.spectatefromstart) battle.seekTurn(Infinity);
		if (PS.prefs.autohardcore) {
			battle.setHardcoreMode(true);
		}
		battle.subscribe(() => this.forceUpdate());
	}
	battleHeight = 360;
	updateLayout() {
		if (!this.base) return;
		const room = this.props.room;
		const width = this.base.offsetWidth;
		if (width && width < 640) {
			const scale = (width / 640);
			room.battle?.scene.$frame!.css('transform', `scale(${scale})`);
			this.battleHeight = Math.round(360 * scale);
		} else {
			room.battle?.scene.$frame!.css('transform', 'none');
			this.battleHeight = 360;
		}
	}
	fastForwardIfRejoining() {
		const room = this.props.room;
		if (!room.rejoining || !room.side) return;
		room.rejoining = false;
		room.battle.seekTurn(Infinity);
	}
	override receiveLine(args: Args) {
		const room = this.props.room;
		switch (args[0]) {
		case 'initdone':
			if (!PS.prefs.spectatefromstart) room.battle.seekTurn(Infinity);
			return;
		case 'request':
			this.receiveRequest(args[1] ? JSON.parse(args[1]) : null);
			return;
		case 'win': case 'tie':
			this.receiveRequest(null);
			break;
		case 'c': case 'c:': case 'chat': case 'chatmsg': case 'inactive':
			room.battle.instantAdd('|' + args.join('|'));
			return;
		case 'error':
			if (args[1].startsWith('[Invalid choice]') && room.request) {
				room.choices = new BattleChoiceBuilder(room.request);
				room.update(null);
			}
			break;
		}
		room.battle.add('|' + args.join('|'));
	}
	receiveRequest(request: BattleRequest | null) {
		const room = this.props.room;
		if (!request) {
			room.request = null;
			room.choices = null;
			return;
		}

		BattleChoiceBuilder.fixRequest(request, room.battle);

		if (request.side) {
			const wasPlayer = !!room.side;
			room.battle.myPokemon = request.side.pokemon;
			room.battle.setViewpoint(request.side.id);
			room.side = request.side;
			if (!wasPlayer) this.fastForwardIfRejoining();
		}

		room.request = request;
		room.choices = new BattleChoiceBuilder(request);
		room.update(null);
	}
	renderControls() {
		const room = this.props.room;
		if (!room.battle) return null;
		if (room.side) {
			return this.renderPlayerControls();
		}
		const atEnd = room.battle.atQueueEnd;
		return <div class="controls">
			<p>
				{atEnd ?
					<button class="button disabled" name="cmd" value="/play"><i class="fa fa-play"></i><br />Play</button>
				: room.battle.paused ?
					<button class="button" name="cmd" value="/play"><i class="fa fa-play"></i><br />Play</button>
				:
					<button class="button" name="cmd" value="/pause"><i class="fa fa-pause"></i><br />Pause</button>
				} {}
				<button class="button" name="cmd" value="/ffto -1"><i class="fa fa-step-backward"></i><br />Last turn</button>
				<button class={"button" + (atEnd ? " disabled" : "")} name="cmd" value="/ffto +1"><i class="fa fa-step-forward"></i><br />Skip turn</button> {}
				<button class="button" name="cmd" value="/ffto 0"><i class="fa fa-undo"></i><br />First turn</button>
				<button class={"button" + (atEnd ? " disabled" : "")} name="cmd" value="/ffto end"><i class="fa fa-fast-forward"></i><br />Skip to end</button>
			</p>
			<p>
				<button class="button" name="cmd" value="/switchsides"><i class="fa fa-random"></i> Switch sides</button>
			</p>
		</div>;
	}
	renderMoveControls(request: BattleMoveRequest, choices: BattleChoiceBuilder) {
		const dex = this.props.room.battle.dex;
		const pokemonIndex = choices.index();
		const active = choices.currentMoveRequest();
		if (!active) return <div class="message-error">Invalid pokemon</div>;

		if (choices.current.max || (active.maxMoves && !active.canDynamax)) {
			if (!active.maxMoves) {
				return <div class="message-error">Maxed with no max moves</div>;
			}
			return active.moves.map((moveData, i) => {
				const move = dex.moves.get(moveData.name);
				const maxMoveData = active.maxMoves![i];
				const gmaxTooltip = maxMoveData.id.startsWith('gmax') ? `|${maxMoveData.id}` : ``;
				const tooltip = `maxmove|${moveData.name}|${pokemonIndex}${gmaxTooltip}`;
				return <MoveButton cmd={`/move ${i + 1} max`} type={move.type} tooltip={tooltip} moveData={moveData}>
					{maxMoveData.name}
				</MoveButton>;
			});
		}

		if (choices.current.z) {
			if (!active.zMoves) {
				return <div class="message-error">No Z moves</div>;
			}
			return active.moves.map((moveData, i) => {
				const move = dex.moves.get(moveData.name);
				const zMoveData = active.zMoves![i];
				if (!zMoveData) {
					return <button disabled>&nbsp;</button>;
				}
				const tooltip = `zmove|${moveData.name}|${pokemonIndex}`;
				return <MoveButton cmd={`/move ${i + 1} zmove`} type={move.type} tooltip={tooltip} moveData={{pp: 1, maxpp: 1}}>
					{zMoveData.name}
				</MoveButton>;
			});
		}

		return active.moves.map((moveData, i) => {
			const move = dex.moves.get(moveData.name);
			const tooltip = `move|${moveData.name}|${pokemonIndex}`;
			return <MoveButton cmd={`/move ${i + 1}`} type={move.type} tooltip={tooltip} moveData={moveData}>
				{move.name}
			</MoveButton>;
		});
	}
	renderMoveTargetControls(request: BattleMoveRequest, choices: BattleChoiceBuilder) {
		const battle = this.props.room.battle;
		const moveTarget = choices.getChosenMove(choices.current, choices.index()).target;
		const moveChoice = choices.stringChoice(choices.current);

		const userSlot = choices.index();
		const userSlotCross = battle.farSide.active.length - 1 - userSlot;

		return [
			battle.farSide.active.map((pokemon, i) => {
				let disabled = false;
				if (moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
					disabled = true;
				} else if (moveTarget === 'normal' || moveTarget === 'adjacentFoe') {
					if (Math.abs(userSlotCross - i) > 1) disabled = true;
				}

				if (pokemon?.fainted) pokemon = null;
				return <PokemonButton
					pokemon={pokemon}
					cmd={disabled ? `` : `/${moveChoice} +${i + 1}`} disabled={disabled && 'fade'} tooltip={`activepokemon|1|${i}`}
				/>;
			}).reverse(),
			<div style="clear: left"></div>,
			battle.nearSide.active.map((pokemon, i) => {
				let disabled = false;
				if (moveTarget === 'adjacentFoe') {
					disabled = true;
				} else if (moveTarget === 'normal' || moveTarget === 'adjacentAlly' || moveTarget === 'adjacentAllyOrSelf') {
					if (Math.abs(userSlot - i) > 1) disabled = true;
				}
				if (moveTarget !== 'adjacentAllyOrSelf' && userSlot === i) disabled = true;

				if (pokemon?.fainted) pokemon = null;
				return <PokemonButton
					pokemon={pokemon}
					cmd={disabled ? `` : `/${moveChoice} -${i + 1}`} disabled={disabled && 'fade'} tooltip={`activepokemon|0|${i}`}
				/>;
			}),
		];
	}
	renderSwitchControls(request: BattleMoveRequest | BattleSwitchRequest, choices: BattleChoiceBuilder) {
		const numActive = choices.requestLength();

		const trapped = choices.currentMoveRequest()?.trapped;

		return request.side.pokemon.map((serverPokemon, i) => {
			const cantSwitch = trapped || i < numActive || choices.alreadySwitchingIn.includes(i + 1) || serverPokemon.fainted;
			return <PokemonButton
				pokemon={serverPokemon} cmd={`/switch ${i + 1}`} disabled={cantSwitch} tooltip={`switchpokemon|${i}`}
			/>;
		});
	}
	renderTeamControls(request: | BattleTeamRequest, choices: BattleChoiceBuilder) {
		return request.side.pokemon.map((serverPokemon, i) => {
			const cantSwitch = choices.alreadySwitchingIn.includes(i + 1);
			return <PokemonButton
				pokemon={serverPokemon} cmd={`/switch ${i + 1}`} noHPBar disabled={cantSwitch && 'fade'} tooltip={`switchpokemon|${i}`}
			/>;
		});
	}
	renderTeamList() {
		const team = this.props.room.battle.myPokemon;
		if (!team) return;
		return <div class="switchcontrols">
			<h3 class="switchselect">Team</h3>
			<div class="switchmenu">
				{team.map((serverPokemon, i) => {
					return <PokemonButton
						pokemon={serverPokemon} cmd={``} noHPBar disabled={true} tooltip={`switchpokemon|${i}`}
					/>;
				})}
			</div>
		</div>;
	}
	renderChosenTeam(request: BattleTeamRequest, choices: BattleChoiceBuilder) {
		return choices.alreadySwitchingIn.map(slot => {
			const serverPokemon = request.side.pokemon[slot - 1];
			return <PokemonButton
				pokemon={serverPokemon} cmd={`/switch ${slot}`} disabled tooltip={`switchpokemon|${slot - 1}`}
			/>;
		});
	}
	renderOldChoices(request: BattleRequest, choices: BattleChoiceBuilder) {
		if (!choices) return null; // should not happen
		if (request.requestType !== 'move' && request.requestType !== 'switch') return;
		if (choices.isEmpty()) return null;

		let buf: preact.ComponentChild[] = [
			<button name="cmd" value="/cancel" class="button"><i class="fa fa-chevron-left"></i> Back</button>, ' ',
		];
		if (choices.isDone() && request.noCancel) {
			buf = ['Waiting for opponent...'];
		}

		const battle = this.props.room.battle;
		for (let i = 0; i < choices.choices.length; i++) {
			const choiceString = choices.choices[i];
			const choice = choices.parseChoice(choiceString);
			if (!choice) continue;
			const pokemon = request.side.pokemon[i];
			const active = request.requestType === 'move' ? request.active[i] : null;
			if (choice.choiceType === 'move') {
				buf.push(`${pokemon.name} will `);
				if (choice.mega) buf.push(<strong>Mega</strong>, ` Evolve and `);
				if (choice.megax) buf.push(<strong>Mega</strong>, ` Evolve (X) and `);
				if (choice.megay) buf.push(<strong>Mega</strong>, ` Evolve (Y) and `);
				if (choice.ultra) buf.push(<strong>Ultra</strong>, ` Burst and `);
				if (choice.tera) buf.push(`Terastallize (`, <strong>{active?.canTerastallize || '???'}</strong>, `) and `);
				if (choice.max && active?.canDynamax) buf.push(active?.gigantamax ? `Gigantamax and ` : `Dynamax and `);
				buf.push(`use `, <strong>{choices.currentMove(choice, i)?.name}</strong>);
				if (choice.targetLoc > 0) {
					const target = battle.farSide.active[choice.targetLoc - 1];
					if (!target) {
						buf.push(` at slot ${choice.targetLoc}`);
					} else {
						buf.push(` at ${target.name}`);
					}
				} else if (choice.targetLoc < 0) {
					const target = battle.nearSide.active[-choice.targetLoc - 1];
					const ally = battle.gameType !== 'freeforall' ? 'ally' : '';
					if (!target) {
						buf.push(` at ${ally} slot ${choice.targetLoc}`);
					} else {
						buf.push(` at ${ally} ${target.name}`);
					}
				}
			} else if (choice.choiceType === 'switch') {
				const target = request.side.pokemon[choice.targetPokemon - 1];
				buf.push(`${pokemon.name} will switch to `, <strong>{target.name}</strong>);
			} else if (choice.choiceType === 'shift') {
				buf.push(`${pokemon.name} will `, <strong>shift</strong>, ` to the center`);
			}
			buf.push(<br />);
		}
		return buf;
	}
	renderPlayerControls() {
		const room = this.props.room;
		const request = room.request;
		let choices = room.choices;
		if (!request) return 'Error: Missing request';
		if (!choices) return 'Error: Missing BattleChoiceBuilder';
		if (choices.request !== request) {
			choices = new BattleChoiceBuilder(request);
			room.choices = choices;
		}

		if (choices.isDone()) {
			return <div class="controls">
				<div class="whatdo">
					<button name="openTimer" class="button disabled timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>
					{this.renderOldChoices(request, choices)}
				</div>
				<div class="pad">
					{request.noCancel ? null : <button name="cmd" value="/cancel" class="button">Cancel</button>}
				</div>
				{this.renderTeamList()}
			</div>;
		}
		if (request.side) room.battle.myPokemon = request.side.pokemon;
		switch (request.requestType) {
		case 'move': {
			const index = choices.index();
			const pokemon = request.side.pokemon[index];
			const moveRequest = choices.currentMoveRequest()!;

			const canDynamax = moveRequest.canDynamax && !choices.alreadyMax;
			const canMegaEvo = moveRequest.canMegaEvo && !choices.alreadyMega;
			const canMegaEvoX = moveRequest.canMegaEvoX && !choices.alreadyMega;
			const canMegaEvoY = moveRequest.canMegaEvoY && !choices.alreadyMega;
			const canZMove = moveRequest.zMoves && !choices.alreadyZ;

			if (choices.current.move) {
				const moveName = choices.getChosenMove(choices.current, choices.index()).name;
				return <div class="controls">
					<div class="whatdo">
						<button name="openTimer" class="button disabled timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>
						{this.renderOldChoices(request, choices)}
						{pokemon.name} should use <strong>{moveName}</strong> at where? {}
					</div>
					<div class="switchcontrols">
						<div class="switchmenu">
							{this.renderMoveTargetControls(request, choices)}
						</div>
					</div>
				</div>;
			}

			const canShift = room.battle.gameType === 'triples' && index !== 1;

			return <div class="controls">
				<div class="whatdo">
					<button name="openTimer" class="button disabled timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>
					{this.renderOldChoices(request, choices)}
					What will <strong>{pokemon.name}</strong> do?
				</div>
				<div class="movecontrols">
					<h3 class="moveselect">Attack</h3>
					<div class="movemenu">
						{this.renderMoveControls(request, choices)}
						<div style="clear:left"></div>
						{canDynamax && <label class={`megaevo${choices.current.max ? ' cur' : ''}`}>
							<input type="checkbox" name="max" checked={choices.current.max} onChange={this.toggleBoostedMove} /> {}
							{moveRequest.canGigantamax ? 'Gigantamax' : 'Dynamax'}
						</label>}
						{canMegaEvo && <label class={`megaevo${choices.current.mega ? ' cur' : ''}`}>
							<input type="checkbox" name="mega" checked={choices.current.mega} onChange={this.toggleBoostedMove} /> {}
							Mega Evolution
						</label>}
						{canMegaEvoX && <label class={`megaevo${choices.current.mega ? ' cur' : ''}`}>
							<input type="checkbox" name="megax" checked={choices.current.megax} onChange={this.toggleBoostedMove} /> {}
							Mega Evolution X
						</label>}
						{canMegaEvoY && <label class={`megaevo${choices.current.mega ? ' cur' : ''}`}>
							<input type="checkbox" name="megay" checked={choices.current.megay} onChange={this.toggleBoostedMove} /> {}
							Mega Evolution Y
						</label>}
						{moveRequest.canUltraBurst && <label class={`megaevo${choices.current.ultra ? ' cur' : ''}`}>
							<input type="checkbox" name="ultra" checked={choices.current.ultra} onChange={this.toggleBoostedMove} /> {}
							Ultra Burst
						</label>}
						{canZMove && <label class={`megaevo${choices.current.z ? ' cur' : ''}`}>
							<input type="checkbox" name="z" checked={choices.current.z} onChange={this.toggleBoostedMove} /> {}
							Z-Power
						</label>}
					</div>
				</div>
				<div class="switchcontrols">
					{canShift && [
						<h3 class="shiftselect">Shift</h3>,
						<button name="cmd" value="/shift">Move to center</button>,
					]}
					<h3 class="switchselect">Switch</h3>
					<div class="switchmenu">
						{this.renderSwitchControls(request, choices)}
					</div>
				</div>
			</div>;
		} case 'switch': {
			const pokemon = request.side.pokemon[choices.index()];
			return <div class="controls">
				<div class="whatdo">
					<button name="openTimer" class="button disabled timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>
					{this.renderOldChoices(request, choices)}
					What will <strong>{pokemon.name}</strong> do?
				</div>
				<div class="switchcontrols">
					<h3 class="switchselect">Switch</h3>
					<div class="switchmenu">
						{this.renderSwitchControls(request, choices)}
					</div>
				</div>
			</div>;
		} case 'team': {
			return <div class="controls">
				<div class="whatdo">
					<button name="openTimer" class="button disabled timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>
					{choices.alreadySwitchingIn.length > 0 ?
						[<button name="cmd" value="/cancel" class="button"><i class="fa fa-chevron-left"></i> Back</button>,
						" What about the rest of your team? "]
					:
						"How will you start the battle? "
					}
				</div>
				<div class="switchcontrols">
					<h3 class="switchselect">Choose {choices.alreadySwitchingIn.length <= 0 ? `lead` : `slot ${choices.alreadySwitchingIn.length + 1}`}</h3>
					<div class="switchmenu">
						{this.renderTeamControls(request, choices)}
						<div style="clear:left"></div>
					</div>
				</div>
				<div class="switchcontrols">
					{choices.alreadySwitchingIn.length > 0 && <h3 class="switchselect">Team so far</h3>}
					<div class="switchmenu">
						{this.renderChosenTeam(request, choices)}
					</div>
				</div>
			</div>;
		}}
	}
	render() {
		const room = this.props.room;

				<button class="button" data-cmd="/play" style="min-width:4.5em">
					<i class="fa fa-undo" aria-hidden></i><br />Replay
				</button> {}
				{isNotTiny && !room.battle.hardcoreMode && <>
					<button class="button button-first" data-cmd="/ffto 0" style="margin-right:2px">
						<i class="fa fa-undo" aria-hidden></i><br />First turn
					</button>
					<button class="button button-first" data-cmd="/ffto -1">
						<i class="fa fa-step-backward" aria-hidden></i><br />Prev turn
					</button>
				</>}
			</p>
			{room.side ? (
				<p>
					<button class="button" data-cmd="/close">
						<strong>Main menu</strong><br /><small>(closes this battle)</small>
					</button> {}
					<button class="button" data-cmd={`/closeand /challenge ${room.battle.farSide.id},${room.battle.tier}`}>
						<strong>Rematch</strong><br /><small>(closes this battle)</small>
					</button>
				</p>
			) : (
				<p>
					<button class="button" data-cmd="/switchsides"><i class="fa fa-random" aria-hidden></i> Switch viewpoint</button> {}
					{!room.battle.hardcoreMode && <button class="button" data-cmd="/ffto">
						<i class="fa fa-random" aria-hidden></i> Go to turn
					</button>}
				</p>
			)}
		</div>;
	}

	handleDownloadReplay = (e: MouseEvent) => {
		let room = this.props.room;
		const target = e.currentTarget as HTMLAnchorElement;
		// download replay
		let filename = (room.battle.tier || 'Battle').replace(/[^A-Za-z0-9]/g, '');
		let date = new Date();
		filename += `-${date.getFullYear()}`;
		filename += `-${date.getMonth() >= 9 ? '' : '0'}${date.getMonth() + 1}`;
		filename += `-${date.getDate() >= 10 ? '' : '0'}${date.getDate()}`;
		filename += '-' + toID(room.battle.p1.name);
		filename += '-' + toID(room.battle.p2.name);
		target.href = window.BattleLog.createReplayFileHref(room);
		target.download = filename + '.html';
		e.stopPropagation();
	};

	override render() {
		const room = this.props.room;
		this.updateLayout();
		const id = `room-${room.id}`;
		const hardcoreStyle = room.battle?.hardcoreMode ? <style
			dangerouslySetInnerHTML={{ __html: `#${id} .battle .turn, #${id} .battle-history { display: none !important; }` }}
		></style> : null;

		if (room.width < 700) {
			return <PSPanelWrapper room={room} focusClick noScroll="hidden">
				{hardcoreStyle}
				<BattleDiv room={room} />
				<ChatLog
					class="battle-log hasuserlist" room={room} top={this.battleHeight} noSubscription
				>
					<div class="battle-controls" role="complementary" aria-label="Battle Controls">
						{this.renderControls()}
					</div>
				</ChatLog>
				<ChatTextEntry room={room} onMessage={this.send} onKey={this.onKey} left={0} />
				<ChatUserList room={room} top={this.battleHeight} minimized />
				<button
					data-href="battleoptions" class="button"
					style={{ position: 'absolute', right: '10px', top: this.battleHeight + 2 }}
				>
					Battle options
				</button>
				{(room.battle && !room.battle.ended && room.request && room.battle.mySide.id === PS.user.userid) &&
					<TimerButton room={room} />}
				<div class="battle-controls-container"></div>
			</PSPanelWrapper>;
		}

		return <PSPanelWrapper room={room} focusClick noScroll="hidden">
			{hardcoreStyle}
			<BattleDiv room={room} />
			<ChatLog
				class="battle-log hasuserlist" room={room} left={640} noSubscription
			>
				{}
			</ChatLog>
			<ChatTextEntry room={room} onMessage={this.send} onKey={this.onKey} left={640} />
			<ChatUserList room={room} left={640} minimized />
			<button
				data-href="battleoptions" class="button"
				style={{ position: 'absolute', right: '10px', top: '2px' }}
			>
				Battle options
			</button>
			<div class="battle-controls-container">
				<div class="battle-controls" role="complementary" aria-label="Battle Controls" style="top: 370px;">
					{(room.battle && !room.battle.ended && room.request && room.battle.mySide.id === PS.user.userid) &&
						<TimerButton room={room} />}
					{this.renderControls()}
				</div>
			</div>
		</PSPanelWrapper>;
	}
}

PS.roomTypes['battle'] = {
	Model: BattleRoom,
	Component: BattlePanel,
};
PS.roomTypes['battles'] = {
	Model: BattlesRoom,
	Component: BattlesPanel,
};
PS.updateRoomTypes();
