(function() {

const kSystemServiceId = 0;
const kDispatch = 0;
const kResolve = 1;
const kReject = 2;
const kWorkerApiScript = 'worker-service-api.js';

class ServiceContext {
  constructor(remote) {
    if (!remote || !remote.postMessage || !remote.addEventListener)
      throw new Error('Invalid remote endpoint.');
    this.resolvers_ = [];
    this.services_ = new Map();
    this.instances_ = [{
      instance: this,
      serviceData: {
        name: 'System',
        type: null,
        methods: {
          connect: this.connectService_,
          disconnect: this.disconnectService_,
          importScripts: this.importScripts_,
        },
      },
    }];
    this.remote_ = remote;
    remote.addEventListener('message', this.handleMessageEvent_.bind(this));
  }

  async connect(name, args) {
    let [instanceId, methodNames] = await this.invoke_(kSystemServiceId,
        'connect', [name, args || []]);
    let methods = new Map(methodNames.map((value) => [value, null]));
    return new Proxy({instanceId_: instanceId}, {
      get: (target, property) => {
        let handler = methods.get(property);
        if (handler)
          return handler;
        if (handler === null) {
          handler = (...args) => this.invoke_(instanceId, property, args);
          methods.set(property, handler);
          return handler;
        }
      },
    });
  }

  disconnect(proxy) {
    let descriptor = Object.getOwnPropertyDescriptor(proxy, 'instanceId_');
    if (!descriptor)
      throw new Error('Invalid instance.');
    return this.invoke_(kSystemServiceId, 'disconnect', [descriptor.value]);
  }

  importScripts(...scripts) {
    return this.invoke_(kSystemServiceId, 'importScripts', [scripts]);
  }

  register(name, type) {
    if (this.services_.has(name))
      throw new Error(`Service '${name}': already registered.`);
    let exposed = type.exposed;
    if (!exposed)
      throw new Error(`Service '${name}': No methods exposed.`);
    if (!Array.isArray(exposed))
      throw new Error(`Service '${name}': exposed property must be an array.`);
    if (!exposed.length)
      throw new Error(`Service '${name}': No methods exposed.`);
    let methods = {};
    for (let methodName of exposed) {
      let method = type.prototype[methodName];
      if (!(method instanceof Function)) {
        throw new Error(`Service '${name}': Exposed method '${methodName}' is` +
            'not a function.');
      }
      methods[methodName] = method;
    }
    this.services_.set(name, {
      name: name,
      type: type,
      methods: methods,
    });
  }

  connectService_(name, args) {
    let serviceData = this.services_.get(name);
    if (!serviceData)
      throw new Error(`No service with name '${name}'.`);
    let instance = new serviceData.type(...args);
    this.instances_.push({
      instance: instance,
      serviceData: serviceData,
    });
    return [this.instances_.length - 1, Object.keys(serviceData.methods)];
  }

  disconnectService_(instanceId) {
    // instanceId zero is the connection service, you can't disconnect from it.
    if (!instanceId)
      throw new Error(`Invalid instanceId ${instanceId}`);
    delete this.instances_[instanceId];
  }

  importScripts_(scripts) {
    self.importScripts(...scripts);
  }

  handleMessageEvent_(event) {
    let data = event.data;
    if (!data || !Array.isArray(data) || data.length != 5) {
      console.error(event);
      throw new Error('Invalid message data.');
    }
    let type = Number(data[0]);
    let resolverId = Number(data[1]);
    let instanceId = Number(data[2]);
    let methodName = String(data[3]);
    let args = data[4];
    switch (type) {
      case kDispatch:
        this.dispatch_(resolverId, instanceId, methodName, args);
        break;
      case kResolve:
        this.resolve_(resolverId, args);
        break;
      case kReject:
        this.reject_(resolverId, args);
        break;
    }
  }

  invoke_(instanceId, methodName, args) {
    return new Promise((resolve, reject) => {
      this.resolvers_.push({
        resolve: resolve,
        reject: reject,
      });
      this.remote_.postMessage([kDispatch, this.resolvers_.length - 1,
          instanceId, methodName, args]);
    });
  }

  resolve_(resolverId, value) {
    let resolver = this.resolvers_[resolverId];
    if (!resolver)
      throw new Error(`Resolve: Bad resolverId '${resolverId}'.`);
    delete this.resolvers_[resolverId];
    resolver.resolve(value);
  }

  reject_(resolverId, errorMessage) {
    let resolver = this.resolvers_[resolverId];
    if (!resolver)
      throw new Error(`Reject: Bad resolverId '${resolverId}'.`);
    delete this.resolvers_[resolverId];
    resolver.reject(new Error(errorMessage));
  }

  async dispatch_(resolverId, instanceId, methodName, args) {
    let entry = this.instances_[instanceId];
    try {
      if (!entry)
        throw new Error(`Invalid instance ${instanceId}`);
      let method = entry.serviceData.methods[methodName];
      if (!method) {
        throw new Error(
            `Service '${entry.serviceData.name}': Invalid method name ` +
            `'${methodName}'.`);
      }
      let result = await method.apply(entry.instance, args);
      this.remote_.postMessage([kResolve, resolverId, instanceId, null, result]);
    } catch (e) {
      this.remote_.postMessage([kReject, resolverId, instanceId, null,
          e.message]);
    }
  }
}

class Worklet extends ServiceContext {
  constructor() {
    super(new Worker(kWorkerApiScript));
  }

  terminate() {
    this.remote_.terminate();
  }
}

// Exposed API.
if (typeof window == "object")
  window.Worklet = Worklet;
else if (typeof self == "object")
  self.services = new ServiceContext(self);

})();
