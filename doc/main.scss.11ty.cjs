/**
 * 'Template' that runs sass and postcss to generate main.css
 */
const { join } = require('path');
const { renderScss } = require('@m-ld/io-web-build');

module.exports = class {
  data() {
    return {
      permalink: 'main.css',
      scssPath: join(__dirname, 'main.scss')
    };
  }
  render() {
    return renderScss.apply(this, arguments);
  }
}