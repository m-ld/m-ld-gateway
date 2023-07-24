const { default11tyConfig, packageDir } = require('@m-ld/io-web-build');
const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const { join } = require('path');

module.exports = function (eleventy) {
  eleventy.ignores.add('doc/README.md');
  eleventy.addPlugin(syntaxHighlight);
  const prismDir = packageDir('prismjs', require);
  eleventy.addPassthroughCopy({
    [join(prismDir, 'prism.js')]: 'prism.js',
    [join(prismDir, 'themes', 'prism.css')]: 'prism.css'
  });
  return default11tyConfig(eleventy, {
    dir: { input: 'doc' },
    fontawesome: false
  });
};