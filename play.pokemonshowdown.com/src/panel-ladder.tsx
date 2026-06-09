/**
 * Ladder Panel
 *
 * Panel for ladder formats and associated ladder tables.
 *
 * @author Adam Tran <aviettran@gmail.com>
 * @license MIT
 */

class LadderRoom extends PSRoom {
	readonly classType: string = 'ladder';
	readonly format?: string = this.id.split('-')[1];
	notice?: string;
	searchValue: string = '';
	lastSearch: string = '';
	loading: boolean = false;
	error?: string;
	ladderData?: string;

	setNotice = (notice: string) => {
		this.notice = notice;
		this.update(null);
	};
	setSearchValue = (searchValue: string) => {
		this.searchValue = searchValue;
		this.update(null);
	};
	setLastSearch = (lastSearch: string) => {
		this.lastSearch = lastSearch;
		this.update(null);
	};
	setLoading = (loading: boolean) => {
		this.loading = loading;
		this.update(null);
	};
	setError = (error: Error) => {
		this.loading = false;
		this.error = error.message;
		this.update(null);
	};
	setLadderData = (ladderData: string | undefined) => {
		this.loading = false;
		this.ladderData = ladderData;
		this.update(null);
	};
	requestLadderData = (searchValue?: string) => {
		const { teams } = PS;
		if (teams.usesLocalLadder) {
			this.send(`/cmd laddertop ${this.format} ${toID(this.searchValue)}`);
		} else if (this.format !== undefined) {
			Net('/ladder.php')
				.get({
					query: {
						format: this.format,
						server: PS.server.id,
						output: 'html',
						prefix: toID(searchValue),
					},
				})
				.then(this.setLadderData)
				.catch(this.setError);
		}
		this.setLoading(true);
	};
}

function LadderFormat(props: {room: LadderRoom}) {
	const {room} = props;
	const {
		format, searchValue, lastSearch, loading, error, ladderData,
		setSearchValue, setLastSearch, requestLadderData,
	} = room;
	if (format === undefined) return null;

	const changeSearch = (e: Event) => {
		setSearchValue((e.currentTarget as HTMLInputElement).value);
	};
	const submitSearch = (e: Event) => {
		e.preventDefault();
		setLastSearch(room.searchValue);
		requestLadderData(room.searchValue);
	};
	const RenderHeader = () => {
		if (!PS.teams.usesLocalLadder) {
			return <h3>
				{BattleLog.escapeFormat(format)} Top{" "}
				{BattleLog.escapeHTML(lastSearch ? `- '${lastSearch}'` : "500")}
			</h3>;
		}
		return null;
	};
	const RenderSearch = () => {
		if (!PS.teams.usesLocalLadder) {
			return <form class="search" onSubmit={submitSearch}>
				<input
					type="text"
					name="searchValue"
					class="textbox searchinput"
					value={BattleLog.escapeHTML(searchValue)}
					placeholder="username prefix"
					onChange={changeSearch}
				/>
				<button type="submit"> Search</button>
			</form>;
		}
		return null;
	};
	const RenderFormat = () => {
		if (loading || !BattleFormats) {
			return <p>Loading...</p>;
		} else if (error !== undefined) {
			return <p>Error: {error}</p>;
		} else if (BattleFormats[format] === undefined) {
			return <p>Format {format} not found.</p>;
		} else if (ladderData === undefined) {
			return null;
		}
		return <>
			<p>
				<button class="button" data-href="ladder" data-target="replace" >
					<i class="fa fa-refresh"></i> Refresh
				</button>
				<RenderSearch/>
			</p>
			<RenderHeader/>
			<SanitizedHTML>{ladderData}</SanitizedHTML>
		</>;
	};
	return <div class="ladder pad">
		<p>
		<button class="button" data-href="ladder" data-target="replace">
				<i class="fa fa-chevron-left"></i> Format List
			</button>
		</p>
		<RenderFormat />
	</div>;
}

class LadderPanel extends PSRoomPanel<LadderRoom> {
	componentDidMount() {
		const {room} = this.props;
		// Request ladder data either on mount or after BattleFormats are loaded
		if (BattleFormats && room.format !== undefined) room.requestLadderData();
		this.subscriptions.push(
			room.subscribe((response: any) => {
				if (response) {
					const [format, ladderData] = response;
					if (room.format === format) {
						if (!ladderData) {
							room.setError(new Error('No data returned from server.'));
						} else {
							room.setLadderData(ladderData);
						}
					}
				}
				this.forceUpdate();
			})
		);
		this.subscriptions.push(
			PS.teams.subscribe(() => {
				if (room.format !== undefined) room.requestLadderData();
				this.forceUpdate();
			})
		);
	}
	static Notice = (props: {notice: string | undefined}) => {
		const {notice} = props;
		if (notice) {
			return (
				<p>
					<strong style="color:red">{notice}</strong>
				</p>
			);
		}
		const showCOIL = room.ladderData?.toplist[0]?.coil !== undefined;

		return <table class="table readable-bg">
			<tr class="table-header">
				<th></th>
				<th>Name</th>
				<th style={{ textAlign: 'center' }}><abbr title="Elo rating">Elo</abbr></th>
				<th style={{ textAlign: 'center' }}>
					<abbr title="user's percentage chance of winning a random battle (Glicko X-Act Estimate)">GXE</abbr>
				</th>
				<th style={{ textAlign: 'center' }}>
					<abbr title="Glicko-1 rating system: rating&plusmn;deviation (provisional if deviation>100)">Glicko-1</abbr>
				</th>
				{showCOIL && <th style={{ textAlign: 'center' }}>COIL</th>}
			</tr>
			{room.ladderData.toplist.map((row, i) => <tr>
				<td style={{ textAlign: 'right' }}>
					{i < 3 && <i class="fa fa-trophy" aria-hidden style={{ color: ['#d6c939', '#adb2bb', '#ca8530'][i] }}></i>} {i + 1}
				</td>
				<td><span
					class="username no-interact" style={{
						fontWeight: i < 10 ? 'bold' : 'normal', color: BattleLog.usernameColor(row.userid),
					}}
				>
					{row.username}
				</span></td>
				<td style={{ textAlign: 'center' }}><strong>{row.elo.toFixed(0)}</strong></td>
				<td style={{ textAlign: 'center' }}>{Math.trunc(row.gxe)}<small>.{row.gxe.toFixed(1).slice(-1)}%</small></td>
				<td style={{ textAlign: 'center' }}><em>{row.rpr.toFixed(0)}<small> &plusmn; {row.rprd.toFixed(0)}</small></em></td>
				{showCOIL && <td style={{ textAlign: 'center' }}>{row.coil?.toFixed(0)}</td>}
			</tr>)}
			{!room.ladderData.toplist.length && <tr><td colSpan={5}>
				<em>No one has played any ranked games yet.</em>
			</td></tr>}
		</table>;
	}
	override render() {
		const room = this.props.room;
		return <PSPanelWrapper room={room}>
			<div class="ladder pad">
				<p>
					<button class="button" data-href="ladder" data-target="replace">
						<i class="fa fa-chevron-left" aria-hidden></i> Format List
					</button>
				</p>
				<p>
					<button class="button" data-href="ladder" data-target="replace">
						<i class="fa fa-refresh" aria-hidden></i> Refresh
					</button> <a class="button" href="/view-seasonladder-gen9randombattle">
						<i class="fa fa-trophy" aria-hidden></i> Seasonal rankings
					</a>
					{this.renderSearch()}
				</p>
				{this.renderHeader()}
				{this.renderTable()}
			</div>
		</PSPanelWrapper>;
	}
}

class LadderListPanel extends PSRoomPanel {
	static readonly id = 'ladder';
	static readonly routes = ['ladder'];
	static readonly icon = <i class="fa fa-list-ol" aria-hidden></i>;
	static readonly title = 'Ladder';

	override componentDidMount() {
		this.subscribeTo(PS.teams);
	}
	renderList() {
		if (!window.BattleFormats) {
			return <p>Loading...</p>;
		}
		let currentSection: string = "";
		let sections: JSX.Element[] = [];
		let formats: JSX.Element[] = [];
		for (const [key, format] of Object.entries(BattleFormats)) {
			if (!format.rated || !format.searchShow) continue;
			if (format.section !== currentSection) {
				if (formats.length > 0) {
					sections.push(<preact.Fragment key={currentSection}>
						<h3>{currentSection}</h3>
						<ul style="list-style:none;margin:0;padding:0">
							{formats}
						</ul>
					</preact.Fragment>);
					formats = [];
				}
				currentSection = format.section;
			}
			formats.push(
				<li key={key} style="margin:5px">
					<button
						name="joinRoom"
						value={`ladder-${key}`}
						class="button"
						style="width:320px;height:30px;text-align:left;font:12pt Verdana"
					>
						{BattleLog.escapeFormat(format.id)}
					</button>
				</li>
			);
		}
		return buf;
	}
	override render() {
		const room = this.props.room;
		return <PSPanelWrapper room={room}>
			<div class="ladder pad">
				{room.format === undefined && (
					<LadderPanel.ShowFormatList room={room} />
				)}
				{room.format !== undefined && <LadderFormat room={room} />}
			</div>
		</PSPanelWrapper>;
	}
}

PS.roomTypes['ladder'] = {
	Model: LadderRoom,
	Component: LadderPanel,
};
PS.updateRoomTypes();
