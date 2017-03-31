
self.services.register('speak', class {
  static get exposed() { return ['concat']; }

  constructor(prefix) {
    this.prefix_ = prefix;
  }

  concat(message) {
    return this.prefix_ + message;
  }
});
