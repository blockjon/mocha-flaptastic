var Mocha = require('mocha');

/**
 * A simple UI that only exposes a single function: test
 */
module.exports = Mocha.interfaces['mocha-flaptastic'] = function(suite) {
    suite.on('pre-require', function(context, file, mocha) {
        console.log("pre-require detected!")
        context.beforeEach('flaptasticSkipper', function() {
            this.currentTest.skip()
        });
    });
};

