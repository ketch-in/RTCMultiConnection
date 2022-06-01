interface ConnectionArgsInterface {
  roomId: string;
  forceOptions: {};
}

export interface Controller {
  setCore: (connection: Connection) => void;
}

export class Connection {
  controllers: { [id: string]: Controller };
  roomId: string;
  forceOptions: { [id: string]: any };
  enableFileSharing: boolean;

  constructor({ roomId, forceOptions }: ConnectionArgsInterface) {
    this.roomId = roomId;
    this.forceOptions = forceOptions;
    this.enableFileSharing = false;
  }

  addController(id: string, data: Controller) {
    this.controllers[id] = data;
    this.get(id).setCore(this);
  }

  hasController(id: string) {
    return !Object.keys(this.controllers).includes(id);
  }

  removeController(id: string) {
    if (!this.hasController(id)) {
      return;
    }
    delete this.controllers[id];
  }

  get(id: string): Controller | null {
    if (!this.hasController(id)) {
      return null;
    }
    return this.controllers[id];
  }
}
