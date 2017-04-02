
function weatherApiUrl(location) {
  return 'https://query.yahooapis.com/v1/public/yql?q=' +
      encodeURIComponent('select item.condition, wind from ' +
          'weather.forecast where woeid in (select woeid from geo.places(1) ' +
          `where text="${location}")`) + '&format=json&env=' +
              encodeURIComponent('store://datatables.org/alltableswithkeys');
}

// Expose a service to the main thread.
self.services.register('speak', class {
  // We have to list what methods are exposed.
  static get exposed() { return ['concat']; }

  // The constructor can take arguments.
  constructor(prefix) {
    this.prefix_ = prefix;
  }

  concat(message) {
    return this.prefix_ + message;
  }
});

self.services.register('weather', class {
  static get exposed() { return ['query']; }

  // If a method returns a Promise (ex. is async) then the system waits for it
  // to resolve and returns the answer.
  async query(location) {
    // Make some network requests and do something "expensive".
    let response = await fetch(weatherApiUrl(location));
    let data = await response.json();
    let channel = data.query.results.channel;
    return {
      temp: channel.item.condition.temp,
      text: channel.item.condition.text,
      wind: channel.wind.speed,
    };
  }
});

// We can also connect to services the main thread exposes to us.
(async function() {
  let dom = await self.services.connect('dom');
  // We can send multiple messages in parallel, since this is all inside one
  // function they'll show up in the same order on the other thread.
  dom.appendText('Inside the worker?');
  dom.appendBox('A box!');
  dom.appendBox('A styled box!', new Map([
    ['color', 'red'],
    ['border', '1px solid blue'],
    ['padding', '5px'],
  ]));
  // For now we need to manually disconnect, eventually we might clean up the
  // instances automatically and auto reconnect when a method is called if the
  // end point has been cleaned up.
  self.services.disconnect(dom);
})();
