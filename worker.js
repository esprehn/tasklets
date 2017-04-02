
function weatherApiUrl(location) {
  return 'https://query.yahooapis.com/v1/public/yql?q=' +
      encodeURIComponent('select item.condition, wind from ' +
          'weather.forecast where woeid in (select woeid from geo.places(1) ' +
          `where text="${location}")`) + '&format=json&env=' +
              encodeURIComponent('store://datatables.org/alltableswithkeys');
}

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

self.services.register('weather', class {
  static get exposed() { return ['query']; }

  async query(location) {
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
  dom.appendText('Inside the worker?');
  dom.appendBox('A box!');
  dom.appendBox('A styled box!', new Map([
    ['color', 'red'],
    ['border', '1px solid blue'],
    ['padding', '5px'],
  ]));
})();
