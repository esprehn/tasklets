# Problem
Most modern development platforms favor a multi-threaded approach by default. Typically, the split for work is:

- __Main thread__: UI manipulation, event/input routing
- __Background thread__: All other work

iOS and Android native platforms, for example, restrict (by default) the usage of any APIs not critical to UI manipulation on the main thread.

The web has support for this model via `WebWorkers`, though the `postMessage()` interface is clunky and difficult to use. As a result, worker adoption has been minimal at best and the default model remains to put all work on the main thread. In order to encourage worker adoption, we need to explore a more ergonomic API.

In anticipation of increased worker usage, this explainer also explores potential solutions to the resource overhead concerns that may come from heavier worker usage.

# Worker API
__Note__: APIs described below are just strawman proposals. We think they're pretty cool but there's always room for improvement.

Today, many uses of `WebWorker`s follow a structure similar to:

```javascript
const worker = new Worker('worker.js');
worker.postMessage({'cmd':'fetch', 'url':'example.com'});
```

A switch statement in the worker then routes messages to the correct API. The tasklet API exposes this behavior natively, by allowing workers to expose methods to outside contexts:

```javascript
// tasklet.js
class Speaker {
  // We have to list what methods are exposed.
  static get exposed() { return ['concat']; }

  concat(message) {
    return `${message} world!`;
  }
}
services.register('speak', Speaker);
```

From the main thread, we can access these exposed methods directly, awaiting them as we would await a normal promise:

```javascript
// main.html
const tasklet = new Tasklet('tasklet.js');
const speaker = await tasklet.connect('speak');

speaker.concat('Hello');
```

This makes it much simpler to dispatch computationally expensive work to a background thread.

# Main thread interaction
In addition to dispatching individual background work, we want sites to architect their entire app in a threaded way. While this is possible with `postMessage` (or the tasklet API), the difficulty in communicating progress and dispatching UI work to the main thread will likely discourage developers from building complex background logic.

A straightforward use case for back and forth communication is progress UI. Imagine a site like Facebook loading the news feed in a background thread. Ideally, as posts come in, the site would like a way to incrementally update the UI, rather than waiting on the entire background process to finish.

This area is a bit more experimental, but there are a few ideas to make this easier:

## Event based communication
If we allowed classes to extend `EventTarget`, tasklets could communicate with the main thread via messages:

```javascript
// tasklet.js
class NewsFeedTasklet extends EventTarget {
  static get exposed() { return []; }

  loadPosts(numPosts) {
    for(let i = 0; i < numPosts; i++) {
      fetch(`posts/today/${i}`)
      .then(res => res.json())
      .then(data => dispatchEvent('new-post', data));
    }
  }
}
services.register('news-feed', NewsFeedTasklet);
```

```html
<!-- main.html -->
<div id="feed">
</div>
<script>
  const tasklet = new Tasklet('tasklet.js');
  const newsFeedTasklet = tasklet.connect('news-feed');

  newsFeedTasklet.addEventListener('new-post', addPost);

  function addPost(e) {
    const data = e.detail;
    let post = document.createElement('div');
    let title = document.createElement('h1');
    let summary = document.createElement('p');

    title.textContent = data.title;
    summary.textContent = data.summary;

    post.appendChild(title);
    post.appendChild(summary);
    document.querySelector('#feed').appendChild(post);
  }
</script>
```

## Exposing main thread methods to tasklets
One way to solve this problem is with the tasklet API in reverse: the main thread can expose methods to background workers:

```javascript
// main.html
const tasklet = new Tasklet();

await tasklet.importScripts('tasklet.js')

tasklet.register('dom', class {
  // We have to list what methods are exposed.
  static get exposed() { return ['appendText', 'appendBox']; }

  appendText(text) {
    let div = document.createElement('div');
    document.body.appendChild(div).textContent = text;
  }

  appendBox(text, style) {
    let div = document.createElement('div');
    if (style) {
      for (let [property, value] of style)
        div.style[property] = value;
    }
    document.body.appendChild(div).textContent = text;
  }
});
```

Those methods are then available within the worker without needing to break the control flow:

```javascript
// tasklet.js
const dom = await services.connect('dom');

// Kick off some main thread work to update the UI
let text = "hello";
dom.appendText(text);

// And then continue with our work here
let box = " world!"
dom.appendBox(box);
```

# ES language support
While using this API provides numerous improvements, there are still some rough edges. There is a fair amount of boilerplate to register functions. A site's logic is split between multiple files for main and background work. There's no simple way to load code into the background inline.

A `remote` keyword could be used to signify code that should be placed in a tasklet:

## Remote blocks
Remote could be used to delineate code that would run in another context and allow the user agent to instantiate it with static knowledge of the module exports:

```javascript
// main.html

// remote blocks create a handle to a context that can be instatiated
// with a platform specific API.
const context = remote {
  class Speaker {
    @expose
    concat(message) {
      return `${message} world!`;
    }
  }
  export { Speaker };
};

// tasks is a module object with the tasklet proxies for each exported class in the remote module block.
const tasks = await Tasklet.import(context);

// We can synchronously create instances of the proxies which map to objects inside the tasklet.
const speaker = new tasks.Speaker();

// All methods return a promise and structured clone the arguments.
const result = await speaker.concat('Hello');
```

For crazier (and less realistic) ideas around language support for exposing main thread APIs, see [ES support for exposing main thread functions](ES-support-main.md).

# Resource overhead of workers
As more sites/content use workers, we will need some way to mitigate the performance overhead that traditionally comes with workers (~5MB per thread). Developers will need some way to share worker resources, even in cases where they do not have direct control of the code they are embedding (iframes, web components).

## Worklets
Worklets are a concept that has been used in various other proposals, such as `AudioWorklet`s or Houdini primitives. We may want to back this API with worklets (which create new context's but can share other resources) to help reduce resource usage. This has the additional benefit that worklets can be moved between threads, allowing the user agent to optimize resource usage based on device constraints.

__Note:__ If worklets are used, we will probably want to replace each usage of "thread" from above with "context", since it's possible all worklets could be running on the same thread in memory constrained situations.

## A default worker
iOS and Android both have a concept of a default background thread. This allows easy coordination of resources by default. One solution is that any services registered via this API would share a common worker, unless otherwise specified:

```javascript
// tasklet.js
services.register('speak', Speaker, 'custom-worker');
```

## Shared workers
`SharedWorker`s may also fit into the solution here, though they are primarily for sharing workers across pages/iframes, rather than allowing a page to coordinate its own resources.
