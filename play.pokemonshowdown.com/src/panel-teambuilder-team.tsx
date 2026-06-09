/**
 * Teambuilder team panel
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 */

class TeamRoom extends PSRoom {
	/** Doesn't _literally_ always exist, but does in basically all code
	 * and constantly checking for its existence is legitimately annoying... */
	team!: Team;
	teamDeleted = false;
	forceReload = false;
	override clientCommands = this.parseClientCommands({
		'validate'(target) {
			if (this.team.format.length <= 4) {
				return this.errorReply(`You must select a format first.`);
			}
			this.send(`/utm ${this.team.packedTeam}`);
			this.send(`/vtm ${this.team.format}`);
		},
	});
	constructor(options: RoomOptions) {
		super(options);
		const team = PS.teams.byKey[this.id.slice(5)] || null;
		this.team = team!;
		this.title = `[Team] ${this.team?.name || 'Not found'}`;
		if (team) this.setFormat(team.format);
		this.load();
	}
	getTeam() {
		const team = PS.teams.byKey[this.id.slice(5)] || null;
		this.teamDeleted = !team && (!!this.team || this.teamDeleted);
		this.team = team!;
		this.title = `[Team] ${this.team?.name || (this.teamDeleted ? 'Team deleted' : 'Not found')}`;
		return team;
	}
	setFormat(format: string) {
		const team = this.team;
		team.format = toID(format);
	}
	load() {
		PS.teams.loadTeam(this.team, true)?.then(() => {
			this.update(null);
		});
	}
	upload(isPrivate: boolean) {
		const team = this.team;
		const cmd = team.uploaded ? 'update' : 'save';
		// teamName, formatid, rawPrivacy, rawTeam
		const buf = [];
		if (team.uploaded) {
			buf.push(team.uploaded.teamid);
		} else if (team.teamid) {
			return PS.alert(`This team is for a different account. Please log into the correct account to update it.`);
		}
		if (!cursorOnly) {
			const bottomY = this.getYAt(value.length, value);
			if (this.setInfo.length) {
				this.setInfo[this.setInfo.length - 1].bottomY = bottomY;
			}

			textbox.style.height = `${bottomY + 100}px`;
			this.save();
		}
		this.forceUpdate();
	};
	save() {
		const sets = PSTeambuilder.importTeam(this.textbox.value);
		this.props.team.packedTeam = PSTeambuilder.packTeam(sets);
		this.props.team.iconCache = null;
		PS.teams.save();
	}
	componentDidMount() {
		this.textbox = this.base!.getElementsByClassName('teamtextbox')[0] as HTMLTextAreaElement;
		this.heightTester = this.base!.getElementsByClassName('heighttester')[0] as HTMLTextAreaElement;

		this.sets = PSTeambuilder.unpackTeam(this.props.team.packedTeam);
		const exportedTeam = PSTeambuilder.exportTeam(this.sets);
		this.textbox.value = exportedTeam;
		this.update();
	}
	componentWillUnmount() {
		this.textbox = null!;
		this.heightTester = null!;
	}
	render() {
		return <div class="teameditor">
			<textarea class="textbox teamtextbox" onInput={this.input} onSelect={this.select} onClick={this.select} onKeyUp={this.select} />
			<textarea
				class="textbox teamtextbox heighttester" style="visibility:hidden" tabIndex={-1} aria-hidden={true}
			/>
			<div class="teamoverlays">
				{this.setInfo.slice(0, -1).map(info =>
					<hr style={`top:${info.bottomY - 18}px`} />
				)}
				{this.setInfo.map((info, i) => {
					if (!info.species) return null;
					const prevOffset = i === 0 ? 8 : this.setInfo[i - 1].bottomY;
					const species = info.species;
					const num = Dex.getPokemonIconNum(toID(species));
					if (!num) return null;

					const top = Math.floor(num / 12) * 30;
					const left = (num % 12) * 40;
					const iconStyle = `background:transparent url(${Dex.resourcePrefix}sprites/pokemonicons-sheet.png) no-repeat scroll -${left}px -${top}px`;

					return <span class="picon" style={
						`top:${prevOffset + 1}px;left:50px;position:absolute;${iconStyle}`
					}></span>;
				})}
				{this.activeOffsetY >= 0 &&
					<div class="teaminnertextbox" style={{top: this.activeOffsetY - 1}}></div>
				}
			</div>
			{this.activeType && <div class="searchresults" style={{top: this.activeSetIndex >= 0 ? this.setInfo[this.activeSetIndex].bottomY - 12 : 0}}>
				<button class="button closesearch" onClick={this.closeMenu}><i class="fa fa-times"></i> Close</button>
				<PSSearchResults search={this.search} />
			</div>}
		</div>;
	}
}

class TeamPanel extends PSRoomPanel<TeamRoom> {
	rename = (e: Event) => {
		const textbox = e.currentTarget as HTMLInputElement;
		const room = this.props.room;

		room.team!.name = textbox.value.trim();
		PS.teams.save();
	};
	render() {
		const room = this.props.room;
		room.upload(room.team.uploaded ? !!room.team.uploaded.private : PS.prefs.uploadprivacy);
	};
	restore = (ev: Event) => {
		const room = this.props.room;
		const team = room.team;
		if (!team.uploadedPackedTeam) {
			// should never happen
			PS.alert(`Must use on an uploaded team.`);
			return;
		}
		team.packedTeam = team.uploadedPackedTeam;
		room.forceReload = true;
		room.save();
		this.forceUpdate();
	};
	compare = (ev: Event) => {
		const team = this.props.room.team;
		if (!team.uploadedPackedTeam) {
			// should never happen
			PS.alert(`Must use on an uploaded team.`);
			return;
		}
		const uploadedTeam = Teams.export(Teams.unpack(team.uploadedPackedTeam));
		const localTeam = Teams.export(Teams.unpack(team.packedTeam));
		PS.alert(BattleLog.html`|html|<table class="table" style="width:100%;font-size:14px"><tr><th>Local</th><th>Uploaded</th></tr><tr><td>${localTeam}</td><td>${uploadedTeam}</td></tr></table>`, { width: 720 });
		ev.preventDefault();
		ev.stopImmediatePropagation();
	};

	changePrivacyPref = (ev: Event) => {
		PS.prefs.uploadprivacy = !(ev.currentTarget as HTMLInputElement).checked;
		PS.prefs.save();
		this.forceUpdate();
	};
	handleChangeFormat = (ev: Event) => {
		const dropdown = ev.currentTarget as HTMLButtonElement;
		const room = this.props.room;

		room.setFormat(dropdown.value);
		room.save();
		this.forceUpdate();
		TeamPanel.getFormatResources(room.team.format).then(() => {
			this.forceUpdate();
		});
	};
	save = () => {
		this.props.room.save();
		this.forceUpdate();
	};
	renderResources() {
		const { room } = this.props;
		const team = room.team;
		const info = TeamPanel.formatResources[team.format];
		const formatName = BattleLog.formatName(team.format);
		return (info && (info.resources.length || info.url)) ? (
			<details class="details" open>
				<summary><strong>Teambuilding resources for {formatName}</strong></summary>
				<div style="margin-left:5px"><ul>
					{info.resources.map(resource => (
						<li><p><a href={resource.url} target="_blank">{resource.resource_name}</a></p></li>
					))}
				</ul>
				<p>
					Find {info.resources.length ? 'more ' : ''}
					helpful resources for {formatName} on <a href={info.url} target="_blank">the Smogon Dex</a>.
				</p></div>
			</details>
		) : null;
	}
	override componentDidUpdate() {
		const room = this.props.room;
		room.load();
	}
	override render() {
		const { room } = this.props;
		const team = room.getTeam();
		if (!team || room.forceReload) {
			if (room.forceReload) {
				room.forceReload = false;
				room.update(null);
			}
			return <PSPanelWrapper room={room}>
				<button class="button" data-href="teambuilder" data-target="replace">
					<i class="fa fa-chevron-left"></i> List
				</button>
				<p class="error">
					{room.teamDeleted ? 'Team was deleted' : 'Team doesn\'t exist'}
				</p>
			</PSPanelWrapper>;
		}

		const unsaved = team.uploaded && team.uploadedPackedTeam ? team.uploadedPackedTeam !== team.packedTeam : false;
		return <PSPanelWrapper room={room}><div class="pad">
			<a class="button" href="teambuilder" data-target="replace">
				<i class="fa fa-chevron-left" aria-hidden></i> Teams
			</a> {}
			{team.uploaded ? (
				<>
					<button class={`button${unsaved ? ' button-first' : ''}`} data-href={`teamstorage-${team.key}`}>
						<i class="fa fa-globe"></i> Account {team.uploaded.private ? '' : "(public)"}
					</button>
					{unsaved && <button class="button button-last" onClick={this.uploadTeam}>
						<strong>Upload changes</strong>
					</button>}
				</>
			) : team.teamid ? (
				<button class="button" data-href={`teamstorage-${team.key}`}>
					<i class="fa fa-plug"></i> Disconnected (wrong account?)
				</button>
				<label class="label teamname">
					Team name:
					<input class="textbox" type="text" value={team.name} onInput={this.rename} onChange={this.rename} onKeyUp={this.rename} />
				</label>
				<TeamTextbox team={team} />
			</div>
		</PSPanelWrapper>;
	}
}

class ViewTeamPanel extends PSRoomPanel {
	static readonly id = 'viewteam';
	static readonly routes = ['viewteam-*'];
	static readonly Model = TeamRoom;
	static readonly title = 'Loading...';
	team: Team | null | undefined;
	teamData: {
		team: string, private: string | null, ownerid: ID, format: ID, title: string, views: number,
	} | null = null;
	override componentDidMount(): void {
		super.componentDidMount();
		const roomid = this.props.room.id;
		const [teamid, password] = roomid.slice(9).split('-');
		PSLoginServer.query('getteam', {
			teamid,
			password,
			full: true,
		}).then(untypedData => {
			const data = untypedData as ViewTeamPanel['teamData'];
			if (!data) {
				this.team = null;
				return;
			}
			this.team = {
				name: data.title,
				format: data.format,
				folder: '',
				packedTeam: data.team,
				iconCache: null,
				key: '',
				isBox: false,
				teamid: parseInt(teamid),
			};
			for (const localTeam of PS.teams.list) {
				if (localTeam.teamid === this.team.teamid) {
					this.team.key = localTeam.key;
					break;
				}
			}
			this.props.room.title = `[Team] ${this.team.name || 'Untitled team'}`;
			this.teamData = data;
			PS.update();
		});
	}

	override render() {
		const { room } = this.props;
		const team = this.team;
		const teamData = this.teamData!;
		if (!team) {
			return <PSPanelWrapper room={room}>
				{team === null ? <p class="error">
					Team doesn't exist
				</p> : <p>
					Loading...
				</p>}
			</PSPanelWrapper>;
		}

		return <PSPanelWrapper room={room}><div class="pad">
			<h1>{team.name || "Untitled team"}</h1>
			<CopyableURLBox
				url={`https://psim.us/t/${team.teamid!}${teamData.private ? '-' + teamData.private : ''}`}
			/> {}
			<p>Uploaded by: <strong>{teamData.ownerid}</strong></p>
			<p>Format: <strong>{teamData.format}</strong></p>
			<p>Views: <strong>{teamData.views}</strong></p>
			{team.key && <p><a class="button" href={`team-${team.key}`}>Edit</a></p>}
			<TeamEditor team={team} readOnly></TeamEditor>
		</div></PSPanelWrapper>;
	}
}

type TeamStorage = 'account' | 'public' | 'disconnected' | 'local';
class TeamStoragePanel extends PSRoomPanel {
	static readonly id = "teamstorage";
	static readonly routes = ["teamstorage-*"];
	static readonly location = "modal-popup";
	static readonly noURL = true;

	chooseOption = (ev: MouseEvent) => {
		const storage = (ev.currentTarget as HTMLButtonElement).value as TeamStorage;
		const room = this.props.room;
		const team = this.team();

		if (storage === 'local' && team.uploaded) {
			PS.send(`/teams delete ${team.uploaded.teamid}`);
			team.uploaded = undefined;
			team.teamid = undefined;
			team.uploadedPackedTeam = undefined;
			PS.teams.save();
			(room.getParent() as TeamRoom).update(null);
		} else if (storage === 'public' && team.uploaded?.private) {
			PS.send(`/teams setprivacy ${team.uploaded.teamid},no`);
		} else if (storage === 'account' && team.uploaded?.private === null) {
			PS.send(`/teams setprivacy ${team.uploaded.teamid},yes`);
		} else if (storage === 'public' && !team.teamid) {
			(room.getParent() as TeamRoom).upload(false);
		} else if (storage === 'account' && !team.teamid) {
			(room.getParent() as TeamRoom).upload(true);
		}
		ev.stopImmediatePropagation();
		ev.preventDefault();
		this.close();
	};
	team() {
		const teamKey = this.props.room.id.slice(12);
		const team = PS.teams.byKey[teamKey]!;
		return team;
	}

	override render() {
		const room = this.props.room;

		const team = this.team();
		const storage: TeamStorage = team.uploaded?.private ? (
			'account'
		) : team.uploaded ? (
			'public'
		) : team.teamid ? (
			'disconnected'
		) : (
			'local'
		);

		if (storage === 'disconnected') {
			return <PSPanelWrapper room={room} width={280}><div class="pad">
				<div><button class="option cur" data-cmd="/close">
					<i class="fa fa-plug"></i> <strong>Disconnected</strong><br />
					Not found in the Teams database. Maybe you uploaded it on a different account?
				</button></div>
			</div></PSPanelWrapper>;
		}
		return <PSPanelWrapper room={room} width={280}><div class="pad">
			<div><button class={`option${storage === 'local' ? ' cur' : ''}`} onClick={this.chooseOption} value="local">
				<i class="fa fa-laptop"></i> <strong>Local</strong><br />
				Stored in cookies on your computer. Warning: Your browser might delete these. Make sure to use backups.
			</button></div>
			<div><button class={`option${storage === 'account' ? ' cur' : ''}`} onClick={this.chooseOption} value="account">
				<i class="fa fa-cloud"></i> <strong>Account</strong><br />
				Uploaded to the Teams database. You can share with the URL.
			</button></div>
			<div><button class={`option${storage === 'public' ? ' cur' : ''}`} onClick={this.chooseOption} value="public">
				<i class="fa fa-globe"></i> <strong>Account (public)</strong><br />
				Uploaded to the Teams database publicly. Share with the URL or people can find it by searching.
			</button></div>
		</div></PSPanelWrapper>;
	}
}

PS.addRoomType(TeamPanel, TeamStoragePanel, ViewTeamPanel);
