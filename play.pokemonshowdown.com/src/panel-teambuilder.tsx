/**
 * Teambuilder panel
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 */

class TeambuilderRoom extends PSRoom {
	readonly DEFAULT_FORMAT = 'gen8' as ID;

	/**
	 * - `""` - all
	 * - `"gen[NUMBER][ID]"` - format folder
	 * - `"gen[NUMBER]"` - uncategorized gen folder
	 * - `"[ID]/"` - folder
	 * - `"/"` - not in folder
	 */
	curFolder = '';
	curFolderKeep = '';

	/**
	 * @return true to prevent line from being sent to server
	 */
	handleMessage(line: string) {
		if (!line.startsWith('/') || line.startsWith('//')) return false;
		const spaceIndex = line.indexOf(' ');
		const cmd = spaceIndex >= 0 ? line.slice(1, spaceIndex) : line.slice(1);
		const target = spaceIndex >= 0 ? line.slice(spaceIndex + 1) : '';
		switch (cmd) {
		case 'newteam': {
			if (target === 'bottom') {
				PS.teams.push(this.createTeam());
			} else {
				PS.teams.unshift(this.createTeam());
			}
			this.update(null);
			return true;
		} case 'deleteteam': {
			const team = PS.teams.byKey[target];
			if (team) PS.teams.delete(team);
			this.update(null);
			return true;
		} case 'undeleteteam': {
			PS.teams.undelete();
			this.update(null);
			return true;
		}}

		// unrecognized command
		alert(`Unrecognized command: ${line}`);
		return true;
	}

	createTeam(copyFrom?: Team): Team {
		if (copyFrom) {
			return {
				name: `Copy of ${copyFrom.name}`,
				format: copyFrom.format,
				folder: copyFrom.folder,
				packedTeam: copyFrom.packedTeam,
				iconCache: null,
				key: '',
			};
		} else {
			const format = this.curFolder && !this.curFolder.endsWith('/') ? this.curFolder as ID : this.DEFAULT_FORMAT;
			const folder = this.curFolder.endsWith('/') ? this.curFolder.slice(0, -1) : '';
			return {
				name: `Untitled ${PS.teams.list.length + 1}`,
				format,
				folder,
				packedTeam: '',
				iconCache: null,
				key: '',
			};
		}
	}
}

class TeambuilderPanel extends PSRoomPanel<TeambuilderRoom> {
	selectFolder = (e: MouseEvent) => {
		const room = this.props.room;
		let elem = e.target as HTMLElement | null;
		let folder: string | null = null;
		while (elem) {
			if (elem.className === 'selectFolder') {
				folder = elem.getAttribute('data-value') || '';
				break;
			} else if (elem.className === 'folderlist') {
				return;
			}
			elem = elem.parentElement;
		}
		if (folder === null) return;
		room.curFolderKeep = folder;
		room.curFolder = folder;
		e.preventDefault();
		e.stopImmediatePropagation();
		this.forceUpdate();
	};
	/** undefined: not dragging, null: dragging a new team */
	getDraggedTeam(ev: DragEvent): Team | number | null {
		if (PS.dragging?.type === 'team') return PS.dragging.team;

		const dataTransfer = ev.dataTransfer;
		if (!dataTransfer) return null;

		PS.dragging = { type: '?' };
		console.log(`dragging: ${dataTransfer.types as any} | ${[...dataTransfer.files]?.map(file => file.name) as any}`);
		if (!dataTransfer.types.includes?.('Files')) return null;
		// MDN says files will be empty except on a Drop event, but the spec says no such thing
		// in practice, Chrome gives this info but Firefox doesn't
		if (dataTransfer.files[0] && !dataTransfer.files[0].name.endsWith('.txt')) return null;

		// We're dragging a file! It might be a team!
		PS.dragging = {
			type: 'team',
			team: 0,
			folder: null,
		};
		return PS.dragging.team;
	}
	dragEnterTeam = (ev: DragEvent) => {
		const draggedTeam = this.getDraggedTeam(ev);
		if (draggedTeam === null) return;

		const value = (ev.currentTarget as HTMLElement)?.getAttribute('data-teamkey');
		const team = value ? PS.teams.byKey[value] : null;
		if (!team || team === draggedTeam) return;

		const iOver = PS.teams.list.indexOf(team);
		if (typeof draggedTeam === 'number') {
			if (iOver >= draggedTeam) (PS.dragging as any).team = iOver + 1;
			(PS.dragging as any).team = iOver;
			this.forceUpdate();
			return;
		}

		const iDragged = PS.teams.list.indexOf(draggedTeam);
		if (iDragged < 0 || iOver < 0) return; // shouldn't happen

		PS.teams.list.splice(iDragged, 1);
		// by coincidence, splicing into iOver works in both directions
		// before: Dragged goes before Over, splice at i
		// after: Dragged goes after Over, splice at i - 1 + 1
		PS.teams.list.splice(iOver, 0, draggedTeam);
		this.forceUpdate();
	};
	dragEnterFolder = (ev: DragEvent) => {
		const value = (ev.currentTarget as HTMLElement)?.getAttribute('data-value') || null;
		if (value === null || PS.dragging?.type !== 'team') return;
		if (value === '++' || value === '') return;

		PS.dragging.folder = value;
		this.forceUpdate();
	};
	dragLeaveFolder = (ev: DragEvent) => {
		const value = (ev.currentTarget as HTMLElement)?.getAttribute('data-value') || null;
		if (value === null || PS.dragging?.type !== 'team') return;
		if (value === '++' || value === '') return;

		if (PS.dragging.folder === value) PS.dragging.folder = null;
		this.forceUpdate();
	};
	static extractDraggedTeam(ev: DragEvent): Promise<Team | null> | null {
		const file = ev.dataTransfer?.files?.[0];
		if (!file) return null;

		let name = file.name;
		if (name.slice(-4).toLowerCase() !== '.txt') {
			// PS.alert(`Your file "${file.name}" is not a valid team. Team files are ".txt" files.`);
			return null;
		}
		name = name.slice(0, -4);

		return file.text?.()?.then(result => {
			let sets;
			try {
				sets = Teams.import(result);
			} catch {
				PS.alert(`Your file "${file.name}" is not a valid team.`);
				return null;
			}
			let format = '';
			const bracketIndex = name.indexOf(']');
			let isBox = false;
			if (bracketIndex >= 0) {
				format = name.slice(1, bracketIndex);
				if (!format.startsWith('gen')) format = 'gen6' + format;
				if (format.endsWith('-box')) {
					format = format.slice(0, -4);
					isBox = true;
				}
				name = name.slice(bracketIndex + 1).trim();
			}
			return {
				name,
				format: format as ID,
				folder: '',
				packedTeam: Teams.pack(sets),
				iconCache: null,
				key: '',
				isBox,
			} satisfies Team;
		});
	}
	static addDraggedTeam(ev: DragEvent, folder?: string) {
		let index: number = (PS.dragging as any)?.team;
		if (typeof index !== 'number') index = 0;
		return this.extractDraggedTeam(ev)?.then(team => {
			if (!team) {
				return;
			}
			if (folder?.endsWith('/')) {
				team.folder = folder.slice(0, -1);
			} else if (folder) {
				team.format = folder as ID;
			}
			PS.teams.push(team);
			PS.teams.list.pop();
			PS.teams.list.splice(index, 0, team);
			PS.teams.save();
			PS.join('teambuilder' as RoomID);
			PS.update();
		});
	}
	dropFolder = (ev: DragEvent) => {
		const value = (ev.currentTarget as HTMLElement)?.getAttribute('data-value') || null;
		if (value === null || PS.dragging?.type !== 'team') return;
		if (value === '++' || value === '') return;

		PS.dragging.folder = null;
		let team = PS.dragging.team;

		if (typeof team === 'number') {
			TeambuilderPanel.addDraggedTeam(ev, value);
			return;
		}

		if (value.endsWith('/')) {
			team.folder = value.slice(0, -1);
		} else {
			team.format = value as ID;
		}
		PS.teams.save();
		ev.stopImmediatePropagation();
		this.forceUpdate();
	};
	static handleDrop(ev: DragEvent) {
		let draggingTeam = false;
		if (PS.dragging?.type === 'team' && typeof PS.dragging?.team === 'object') {
			PS.teams.save();
			draggingTeam = true;
		}
		return !!this.addDraggedTeam(ev, (PS.rooms['teambuilder'] as TeambuilderRoom)?.curFolder) || draggingTeam;
	}
	updateSearch = (ev: KeyboardEvent) => {
		const target = ev.currentTarget as HTMLInputElement;
		this.props.room.updateSearch(target.value);
		this.forceUpdate();
	};
	clearSearch = () => {
		const target = this.base!.querySelector<HTMLInputElement>('input[type="search"]');
		if (!target) return;
		target.value = '';
		this.props.room.updateSearch('');
	};
	renderFolder(value: string) {
		const { room } = this.props;
		const cur = room.curFolder === value;
		let children;
		const folderOpenIcon = cur ? 'fa-folder-open' : 'fa-folder';
		if (value.endsWith('/')) {
			// folder
			children = [
				<i class={`fa ${folderOpenIcon}${value === '/' ? '-o' : ''}`}></i>,
				value.slice(0, -1) || '(uncategorized)',
			];
		} else if (value === '') {
			children = [
				<em>(all)</em>,
			];
		} else if (value === '++') {
			children = [
				<i class="fa fa-plus" aria-hidden></i>,
				<em>(add folder)</em>,
			];
		} else {
			children = [
				<i class={`fa ${folderOpenIcon}-o`}></i>,
				value.slice(4) || '(uncategorized)',
			];
		}

		// folders were <div>s rather than <button>s because in theory it has
		// less weird interactions with HTML5 drag-and-drop (looking at Firefox)
		// modern browsers don't seem to have these bugs, so we're going to make
		// them buttons for now
		const active = (PS.dragging as any)?.folder === value ? ' active' : '';
		if (cur) {
			return <div
				class="folder cur" data-value={value}
				onDragEnter={this.dragEnterFolder} onDragLeave={this.dragLeaveFolder} onDrop={this.dropFolder}
			>
				<div class="folderhack3">
					<div class="folderhack1"></div><div class="folderhack2"></div>
					<button class={`selectFolder${active}`} data-value={value}>{children}</button>
				</div>
			</div>;
		}
		return <div
			class="folder" data-value={value}
			onDragEnter={this.dragEnterFolder} onDragLeave={this.dragLeaveFolder} onDrop={this.dropFolder}
		>
			<button class={`selectFolder${active}`} data-value={value}>{children}</button>
		</div>;
	}
	saveExport = (e: MouseEvent) => {
		const value = this.base!.querySelector<HTMLTextAreaElement>('textarea[name="import"]')?.value;
		if (!value) return alert('Textarea not found');
		if (this.props.room.exportMode !== true) return alert('Wrong export mode');

		const teams = PSTeambuilder.importTeamBackup(value);
		// const visibleTeams = this.visibleTeams();
		// alert(`${teams.length} teams imported, ${visibleTeams.length} teams visible now`);
		PS.teams.list = [];
		PS.teams.byKey = {};
		for (const team of teams) PS.teams.push(team);
		// TODO: say what changed

		const room = this.props.room;
		room.exportMode = false;
		PS.teams.save();
		room.update(null);
	};
	renameFolder = (ev: MouseEvent) => {
		const { room } = this.props;
		const oldFolder = room.curFolder.slice(0, -1);
		const elem = ev.currentTarget as HTMLElement;
		ev.stopImmediatePropagation();
		ev.preventDefault();
		PS.prompt(`Rename \`\`${oldFolder}\`\` to?`, { defaultValue: oldFolder, okButton: "Rename", parentElem: elem }).then(name => {
			name = (name || '').trim();
			if (!name) return;
			if (name === oldFolder) return;

			room.send(`/renamefolder ${name}`, elem);
		});
	};
	promptDeleteFolder = (ev: MouseEvent) => {
		const { room } = this.props;
		const oldFolder = room.curFolder.slice(0, -1);
		const elem = ev.currentTarget as HTMLElement;
		ev.stopImmediatePropagation();
		ev.preventDefault();
		PS.confirm(`Delete \`\`${oldFolder}\`\`? (doesn't delete teams)`, {
			okButton: "Delete", otherButtons: <button class="button" data-cmd="/closeand /inopener /convertfoldertoprefix">Convert to prefix</button>,
			parentElem: elem,
		}).then(result => {
			if (result) room.send(`/deletefolder`, elem);
		});
	};
	renderFolderList() {
		const room = this.props.room;
		// The folder list isn't actually saved anywhere:
		// it's regenerated anew from the team list every time.

		// (This is why folders you create will automatically disappear
		// if you leave them without adding anything to them.)

		const folderTable: {[folder: string]: 1 | undefined} = {'': 1};
		const folders: string[] = [];
		for (const team of PS.teams.list) {
			const folder = team.folder;
			if (folder && !(`${folder}/` in folderTable)) {
				folders.push(`${folder}/`);
				folderTable[`${folder}/`] = 1;
				if (!('/' in folderTable)) {
					folders.push('/');
					folderTable['/'] = 1;
				}
			}

			const format = team.format || room.DEFAULT_FORMAT;
			if (!(format in folderTable)) {
				folders.push(format);
				folderTable[format] = 1;
			}
		}
		if (!(room.curFolderKeep in folderTable)) {
			folderTable[room.curFolderKeep] = 1;
			folders.push(room.curFolderKeep);
		}
		if (!(room.curFolder in folderTable)) {
			folderTable[room.curFolder] = 1;
			folders.push(room.curFolder);
		}

		PSUtils.sortBy(folders, folder => [
			folder.endsWith('/') ? 10 : -parseInt(folder.charAt(3), 10),
			folder,
		]);

		let renderedFormatFolders = [
			<div class="foldersep"></div>,
			<TeamFolder cur={false} value="+">
				<i class="fa fa-plus"></i><em>(add format folder)</em>
			</TeamFolder>,
		];

		let renderedFolders: preact.ComponentChild[] = [];

		let gen = -1;
		for (let format of folders) {
			const newGen = format.endsWith('/') ? 0 : parseInt(format.charAt(3), 10);
			if (gen !== newGen) {
				gen = newGen;
				if (gen === 0) {
					renderedFolders.push(...renderedFormatFolders);
					renderedFormatFolders = [];
					renderedFolders.push(<div class="foldersep"></div>);
					renderedFolders.push(<div class="folder"><h3>Folders</h3></div>);
				} else {
					renderedFolders.push(<div class="folder"><h3>Gen {gen}</h3></div>);
				}
			}
			const folderOpenIcon = room.curFolder === format ? 'fa-folder-open' : 'fa-folder';
			if (gen === 0) {
				renderedFolders.push(<TeamFolder cur={room.curFolder === format} value={format}>
					<i class={
						`fa ${folderOpenIcon}${format === '/' ? '-o' : ''}`
					}></i>
					{format.slice(0, -1) || '(uncategorized)'}
				</TeamFolder>);
				continue;
			}

			renderedFolders.push(<TeamFolder cur={room.curFolder === format} value={format}>
				<i class={`fa ${folderOpenIcon}-o`}></i>
				{format.slice(4) || '(uncategorized)'}
			</TeamFolder>);
		}
		renderedFolders.push(...renderedFormatFolders);

		return <div class="folderlist" onClick={this.selectFolder}>
			<div class="folderlistbefore"></div>

			<TeamFolder cur={!room.curFolder} value="">
				<em>(all)</em>
			</TeamFolder>
			{renderedFolders}
			<div class="foldersep"></div>
			<TeamFolder cur={false} value="++">
				<i class="fa fa-plus"></i><em>(add folder)</em>
			</TeamFolder>

			<div class="folderlistafter"></div>
		</div>;
	}

	render() {
		const room = this.props.room;
		let teams: (Team | null)[] = PS.teams.list.slice();

		if (PS.teams.deletedTeams.length) {
			const undeleteIndex = PS.teams.deletedTeams[PS.teams.deletedTeams.length - 1][1];
			teams.splice(undeleteIndex, 0, null);
		}

		let filterFolder: string | null = null;
		let filterFormat: string | null = null;
		if (room.curFolder) {
			if (room.curFolder.slice(-1) === '/') {
				filterFolder = room.curFolder.slice(0, -1);
				teams = teams.filter(team => !team || team.folder === filterFolder);
			} else {
				filterFormat = room.curFolder;
				teams = teams.filter(team => !team || team.format === filterFormat);
			}
		}

		const filteredTeams = this.visibleTeams(teams);

		if (room.exportMode) {
			return <div class="teampane">
				<p>
					<button data-cmd="/backup" class="button">
						<i class="fa fa-caret-left" aria-hidden></i> Back
					</button> {}
					{room.exportMode !== true && <button class="button" disabled>
						<i class="fa fa-save" aria-hidden></i> Save (not allowed for partial exports)
					</button>}
					{room.exportMode === true && <button onClick={this.saveExport} class="button">
						<i class="fa fa-save" aria-hidden></i> Save changes
					</button>}
				</p>
				<PSTextarea
					name="import" initialValue={(room.exportCode ??= PS.teams.packAll(filteredTeams.filter(Boolean) as Team[]))}
				/>
			</div>;
		}

		const clipboard = window.TeamEditorState ? TeamEditorState.clipboard : null;
		const clipboardTeams = clipboard?.teams;
		return <div class="teampane">
			{window.TeamEditorState && TeamEditorState.renderClipboard(this.cancelClipboard)}
			{filterFolder ? (
				<h2>
					<i class="fa fa-folder-open" aria-hidden></i> {filterFolder} {}
					<button class="button small" style="margin-left:5px" onClick={this.renameFolder}>
						<i class="fa fa-pencil" aria-hidden></i> Rename
					</button> {}
					<button class="button small" style="margin-left:5px" onClick={this.promptDeleteFolder}>
						<i class="fa fa-times" aria-hidden></i> Remove
					</button>
				</h2>
			) : filterFolder === '' ? (
				<h2><i class="fa fa-folder-open-o" aria-hidden></i> Teams not in any folders</h2>
			) : filterFormat ? (
				<h2><i class="fa fa-folder-open-o" aria-hidden></i> {filterFormat} <small>({teams.length})</small></h2>
			) : (
				<h2>All Teams <small>({teams.length})</small></h2>
			)}
			<p>
				<button data-cmd="/newteam" class="button big">
					<i class="fa fa-plus-circle" aria-hidden></i> New {teamTerm}
				</button> {}
				<button data-cmd="/newteam box" class="button">
					<i class="fa fa-archive" aria-hidden></i> New box
				</button>
				<input
					type="search" class="textbox" placeholder="Search teams"
					style="margin-left:5px;" onKeyUp={this.updateSearch}
				></input>
			</p>
			<ul class="teamlist">
				{!teams.length ? (
					<li><em>you have no teams lol</em></li>
				) : !filteredTeams.length && room.searchTerms.length ? (
					<li><em>you have no teams matching <code>{room.searchTerms.join(", ")}</code></em></li>
				) : !filteredTeams.length ? (
					<li><em>you have no teams in this folder</em></li>
				) : filteredTeams.map(team => team ? (
					<li
						key={team.key} onDragEnter={this.dragEnterTeam} data-teamkey={team.key}
						class={clipboardTeams?.[team.key] ? 'cur' : ''}
					>
						{clipboardTeams && <div>
							<button class="button notifying" data-cmd={`/pasteteamabove ${team.key}`}>
								<i class="fa fa-clipboard" aria-hidden></i> Paste copy here
							</button> {}
							<button class="button notifying" data-cmd={`/moveteamabove ${team.key}`} disabled={clipboard.readonly}>
								<i class="fa fa-arrow-right" aria-hidden></i> Move here
							</button>
						</div>}
						<TeamBox team={team} onClick={this.clearSearch} /> {}
						{clipboardTeams && !clipboardTeams[team.key] && <button data-cmd={`/copyteam ${team.key}`} class="option">
							<i class="fa fa-copy" aria-hidden></i> + Clipboard
						</button>}
						{clipboardTeams?.[team.key] && <button data-cmd={`/copyteam ${team.key}`} class="option">
							<i class="fa fa-times" aria-hidden></i> Deselect
						</button>}
						{!clipboardTeams && <button data-cmd={`/copyteam ${team.key}`} class="option" aria-label="Copy/move" title="Copy/move">
							<i class="fa fa-copy" aria-hidden></i>
						</button>} {}
						{!clipboardTeams && !team.uploaded && <button data-cmd={`/deleteteam ${team.key}`} class="option">
							<i class="fa fa-trash" aria-hidden></i> Delete
						</button>} {}
						{team.uploaded?.private ? (
							<i class="fa fa-cloud gray"></i>
						) : team.uploaded ? (
							<i class="fa fa-globe gray"></i>
						) : team.teamid ? (
							<i class="fa fa-plug gray"></i>
						) : (
							null
						)}
					</li>
				) : isDragging ? (
					<li key="dragging">
						<div class="team"></div>
					</li>
				) : (
					<li key="undelete">
						<button data-cmd="/undeleteteam" class="option">
							<i class="fa fa-undo" aria-hidden></i> Undo delete
						</button>
					</li>
				))}
				{clipboardTeams && <div>
					<button class="button notifying" data-cmd="/pasteteamabove -">
						<i class="fa fa-clipboard" aria-hidden></i> Paste copy here
					</button> {}
					<button class="button notifying" data-cmd="/moveteamabove -" disabled={clipboard.readonly}>
						<i class="fa fa-arrow-right" aria-hidden></i> Move here
					</button>
				</div>}
			</ul>
			<p>
				<button data-cmd="/newteam bottom" class="button">
					<i class="fa fa-plus-circle" aria-hidden></i> New {teamTerm}
				</button> {}
				<button data-cmd="/newteam box bottom" class="button">
					<i class="fa fa-archive" aria-hidden></i> New box
				</button>
			</p>
			<p>
				<button data-cmd="/backup" class="button">
					<i class="fa fa-file-code-o" aria-hidden></i> Backup
					{room.searchTerms.length ? ' search results' : room.curFolder ? ' folder' : ''}
				</button>
			</p>
		</div>;
	}
	override render() {
		const room = this.props.room;

		return <PSPanelWrapper room={room} noScroll>
			<div class="folderpane">
				{this.renderFolderList()}
			</div>
			<div class="teampane">
				{filterFolder ?
					<h2>
						<i class="fa fa-folder-open"></i> {filterFolder} {}
						<button class="button small" style="margin-left:5px" name="renameFolder">
							<i class="fa fa-pencil"></i> Rename
						</button> {}
						<button class="button small" style="margin-left:5px" name="promptDeleteFolder">
							<i class="fa fa-times"></i> Remove
						</button>
					</h2>
				: filterFolder === '' ?
					<h2><i class="fa fa-folder-open-o"></i> Teams not in any folders</h2>
				: filterFormat ?
					<h2><i class="fa fa-folder-open-o"></i> {filterFormat} <small>({teams.length})</small></h2>
				:
					<h2>All Teams <small>({teams.length})</small></h2>
				}
				<p>
					<button name="cmd" value="/newteam" class="button big"><i class="fa fa-plus-circle"></i> New Team</button>
				</p>
				<ul class="teamlist">
					{teams.map(team => team ? (
						<li key={team.key}>
							<TeamBox team={team} /> {}
							<button name="cmd" value={`/deleteteam ${team.key}`}><i class="fa fa-trash"></i> Delete</button>
						</li>
					) : (
						<li key="undelete">
							<button name="cmd" value={`/undeleteteam`}><i class="fa fa-undo"></i> Undo delete</button>
						</li>
					))}
				</ul>
				<p>
					<button name="cmd" value="/newteam bottom" class="button"><i class="fa fa-plus-circle"></i> New Team</button>
				</p>
			</div>
		</PSPanelWrapper>;
	}
}

PS.roomTypes['teambuilder'] = {
	Model: TeambuilderRoom,
	Component: TeambuilderPanel,
	title: "Teambuilder",
};
