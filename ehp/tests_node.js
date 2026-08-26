/* Node-runner voor de EHP-tests.
   Draaien vanuit de projectmap:   node ehp/tests_node.js

   De app heeft geen bundler en geen testframework; de modules zijn gewone scripts die
   zich aan `window` hangen. Deze runner zet een minimale `window` op en laadt precies
   de DOM-loze modules in dezelfde volgorde als index.html. Zo draaien dezelfde tests
   in de browserconsole (`ehpTests()`) en in een terminal, zonder tweede implementatie.
*/
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var wortel = path.resolve(__dirname, '..');

// Minimale browseromgeving. Geen enkele module hieronder raakt de DOM; zou dat
// veranderen, dan valt dat hier meteen op in plaats van in productie.
var sandbox = {console: console, Math: Math, Date: Date, JSON: JSON,
               Float64Array: Float64Array, Int16Array: Int16Array, Uint8Array: Uint8Array,
               Array: Array, Object: Object, Number: Number, String: String,
               isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt,
               Infinity: Infinity, NaN: NaN, undefined: undefined};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
var ctx = vm.createContext(sandbox);

var bestanden = [
  'tarieven.js',
  'rekenkern.js',
  'energiemodel.js',
  'ehp/aannames.js',
  'ehp/prijsmodel.js',
  'ehp/dispatch.js',
  'ehp/opslag.js',
  'ehp/verdeling.js',
  'ehp/matching.js',
  'ehp/matching_run.js',
  'ehp/matching_verrekening.js',
  'ehp/tests.js'
];

bestanden.forEach(function (b) {
  var code = fs.readFileSync(path.join(wortel, b), 'utf8');
  try {
    vm.runInContext(code, ctx, {filename: b});
  } catch (e) {
    console.error('Laden van ' + b + ' mislukt:', e && e.stack || e);
    process.exit(2);
  }
});

var filter = process.argv[2] || null;
var res = sandbox.EhpTests.run(filter);
sandbox.EhpTests.rapporteer(res);
process.exit(res.alles ? 0 : 1);
