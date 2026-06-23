type EventCallback = (payload?: any) => void;

export class EventBus {

    private static _instance: EventBus;

    static get instance(): EventBus {
        if (!this._instance) {
            this._instance = new EventBus();
        }
        return this._instance;
    }

    private events: Map<string, Set<EventCallback>> = new Map();

    on(event: string, cb: EventCallback) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event)!.add(cb);
    }

    off(event: string, cb: EventCallback) {
        this.events.get(event)?.delete(cb);
    }

    emit(event: string, payload?: any) {
        const cbs = this.events.get(event);
        if (!cbs) return;
        for (const cb of cbs) {
            cb(payload);
        }
    }

    clear(event?: string) {
        if (event) this.events.delete(event);
        else this.events.clear();
    }
}