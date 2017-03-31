
// Expose a service to the main thread.
self.services.register('speak', class {
  static get exposed() { return ['concat']; }

  constructor(prefix) {
    this.prefix_ = prefix;
  }

  concat(message) {
    return this.prefix_ + message;
  }
});

// We can also connect to services the main thread exposes to us.
(async function() {
  let dom = await self.services.connect('dom');
  dom.appendText('Inside the worker?');
})();
