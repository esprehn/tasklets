# Syntactic sugar for accessing DOM apis
We could replace the need to register main thread APIs by allowing developers to pass a reference to the current context when they construct a tasklet:

```javascript
// main.html
import tasklet.js; // defines TextAdder
import dom.js; // defines appendText(text) and appendBox(text, style)

const textAdder = new textAdder(document);
textAdder.doSomething();
```

```javascript
// tasklet.js
remote class TextAdder {
  constructor(context) {
    this.dom = context;
  }

  async doSomething() {
    await this.dom.appendText('Hello');
    await this.dom.appendBox(' World!');
  }
}
```

Allowing this sort of context passing also makes it easier to define web components that split work between main and background:

```html
<!-- Declarative view -->
<template id="my-element">
  <div id="color">Red</div>
  <button onclick="swap">Click me!</button>
</template>

<!-- View logic -->
<script>
  // Custom element definition
  class MyElement extends HTMLElement {
    constructor() {
      super();

      // Import template markup
      let markup = document.querySelector('#my-element'); // imagine this works
      let shadowRoot = this.attachShadow({mode:'open'});
      shadowRoot.appendChild(markup.content.cloneNode(true));

      // Initialize backgound work
      this.tasklet = new MyElementTasklet(this);
    }

    swap() {
      const currentColor = this.shadowRoot.querySelector('#text').textContent;
      this.tasklet.updateColor(currentColor);
    }

    updateUI(newColor) {
      this.shadowRoot.querySelector('#text').textContent = newColor;
    }
  }

  // Background class
  remote class MyElementTasklet {
    constructor(context) {
      this.dom = context;
    }

    updateColor(currentColor) {
      if(currentColor == 'Red') {
        this.dom.updateUI('Blue');
      }
      else {
        this.dom.updateUI('Red');
      }
    }
  }
  // Register the element
  window.customElements.define('my-element', MyElement);
</script>
```
