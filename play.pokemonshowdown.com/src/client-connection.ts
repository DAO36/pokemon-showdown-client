/**
 * Connection library
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license MIT
 */

declare var SockJS: any;

class PSConnection {
	socket: any = null;
	connected = false;
	lastMessageTimeBeforeReconnect = 0;
	queue: string[] = [];
	reconnectDelay = 1000;
	private reconnectCap = 15000;
	private shouldReconnect = true;
	reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private worker: Worker | null = null;

	constructor() {
		this.connect();
	}

	initConnection() {
		if (!this.tryConnectInWorker()) this.directConnect();
	}

	canReconnect() {
		const uptime = Date.now() - PS.startTime;
		if (uptime > 24 * 60 * 60 * 1000) {
			PS.confirm(`It's been over a day since you first connected. Please refresh.`, {
				okButton: 'Refresh',
			}).then(confirmed => {
				if (confirmed) PS.room?.send(`/refresh`);
			});
			return false;
		}
		return this.shouldReconnect;
	}

	tryConnectInWorker(): boolean {
		if (this.socket) return false; // must be one or the other
		if (this.connected) return true;

		if (this.worker) {
			this.worker.postMessage({ type: 'connect', server: PS.server });
			return true;
		}

		try {
			const worker = new Worker('/js/client-connection-worker.js');
			this.worker = worker;

			worker.postMessage({ type: 'connect', server: PS.server });

			worker.onmessage = event => {
				const { type, data } = event.data;
				switch (type) {
				case 'connected':
					console.log('\u2705 (CONNECTED via worker)');
					this.lastMessageTimeBeforeReconnect = parseInt(PS.lastMessageTime) || 0;
					this.connected = true;
					if (PS.prefs.avatar) worker.postMessage({ type: 'send', data: `/avatar ${PS.prefs.avatar},1` });
					this.queue.forEach(msg => worker.postMessage({ type: 'send', data: msg }));
					this.queue = [];
					PS.update();
					break;
				case 'message':
					PS.receive(data);
					break;
				case 'disconnected':
					this.handleDisconnect();
					break;
				case 'error':
					console.warn(`Worker connection error: ${data}`);
					this.worker = null;
					// onerror can occur on abrupt disconnects or fatal errors.
					// handleDisconnect ensures proper cleanup and also attemps to reconnect.
					this.handleDisconnect(); // fallback
					break;
				}
			};

			worker.onerror = (ev: ErrorEvent) => {
				console.warn('Worker connection error:', ev);
				this.worker = null;
				this.directConnect(); // fallback
			};

			return true;
		} catch {
			console.warn('Worker connection failed, falling back to regular connection.');
			this.worker = null;
			return false;
		}
	}

	directConnect() {
		if (this.worker) return; // must be one or the other

		const server = PS.server;
		const port = server.protocol === 'https' ? '' : ':' + server.port;
		const url = server.protocol + '://' + server.host + port + server.prefix;
		const socket = this.socket = new SockJS(url, [], {timeout: 5 * 60 * 1000});
		socket.onopen = () => {
			console.log('\u2705 (CONNECTED)');
			this.lastMessageTimeBeforeReconnect = parseInt(PS.lastMessageTime) || 0;
			this.connected = true;
			this.reconnectDelay = 1000;
			if (PS.prefs.avatar) socket.send(`/avatar ${PS.prefs.avatar},1`);
			this.queue.forEach(msg => socket.send(msg));
			this.queue = [];
			PS.update();
		};
		socket.onmessage = (e: MessageEvent) => {
			PS.receive('' + e.data);
		};
		socket.onclose = () => {
			console.log('\u2705 (DISCONNECTED)');
			this.connected = false;
			PS.connected = false;
			PS.isOffline = true;
			for (const roomid in PS.rooms) {
				PS.rooms[roomid]!.connected = false;
			}
			this.socket = null;
			PS.update();
		};
	}
	disconnect() {
		this.socket.close();
		PS.connection = null;
	}
	send(msg: string) {
		if (!this.connected) {
			this.queue.push(msg);
			return;
		}
		this.socket.send(msg);
	}
}

PS.connection = new PSConnection();

const PSLoginServer = new class {
	query(data: PostData): Promise<{[k: string]: any} | null> {
		let url = '/~~' + PS.server.id + '/action.php';
		if (location.pathname.endsWith('.html')) {
			url = 'https://' + Config.routes.client + url;
			// @ts-ignore
			if (typeof POKEMON_SHOWDOWN_TESTCLIENT_KEY === 'string') {
				// @ts-ignore
				data.sid = POKEMON_SHOWDOWN_TESTCLIENT_KEY.replace(/\%2C/g, ',');
			}
		}
		return Net(url).get({method: data ? 'POST' : 'GET', body: data}).then(
			res => res ? JSON.parse(res.slice(1)) : null
		).catch(
			() => null
		);
	}
};

interface PostData {
	[key: string]: string | number;
}
interface NetRequestOptions {
	method?: 'GET' | 'POST';
	body?: string | PostData;
	query?: PostData;
}
class HttpError extends Error {
	statusCode?: number;
	body: string;
	constructor(message: string, statusCode: number | undefined, body: string) {
		super(message);
		this.name = 'HttpError';
		this.statusCode = statusCode;
		this.body = body;
		try {
			(Error as any).captureStackTrace(this, HttpError);
		} catch (err) {}
	}
}
class NetRequest {
	uri: string;
	constructor(uri: string) {
		this.uri = uri;
	}

	/**
	 * Makes a basic http/https request to the URI.
	 * Returns the response data.
	 *
	 * Will throw if the response code isn't 200 OK.
	 *
	 * @param opts request opts
	 */
	get(opts: NetRequestOptions = {}): Promise<string> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			let uri = this.uri;
			if (opts.query) {
				uri += (uri.includes('?') ? '&' : '?') + Net.encodeQuery(opts.query);
			}
			xhr.open(opts.method || 'GET', uri);
			xhr.onreadystatechange = function () {
				const DONE = 4;
				if (xhr.readyState === DONE) {
					if (xhr.status === 200) {
						resolve(xhr.responseText || '');
						return;
					}
					const err = new HttpError(xhr.statusText || "Connection error", xhr.status, xhr.responseText);
					reject(err);
				}
			};
			if (opts.body) {
				xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
				xhr.send(Net.encodeQuery(opts.body));
			} else {
				xhr.send();
			}
		});
	}

	/**
	 * Makes a http/https POST request to the given link.
	 * @param opts request opts
	 * @param body POST body
	 */
	post(opts: Omit<NetRequestOptions, 'body'>, body: PostData | string): Promise<string>;
	/**
	 * Makes a http/https POST request to the given link.
	 * @param opts request opts
	 */
	post(opts?: NetRequestOptions): Promise<string>;
	post(opts: NetRequestOptions = {}, body?: PostData | string) {
		if (!body) body = opts.body;
		return this.get({
			...opts,
			method: 'POST',
			body,
		});
	}
}

function Net(uri: string) {
	return new NetRequest(uri);
}

Net.encodeQuery = function (data: string | PostData) {
	if (typeof data === 'string') return data;
	let urlencodedData = '';
	for (const key in data) {
		if (urlencodedData) urlencodedData += '&';
		urlencodedData += encodeURIComponent(key) + '=' + encodeURIComponent((data as any)[key]);
	}
	return urlencodedData;
};
