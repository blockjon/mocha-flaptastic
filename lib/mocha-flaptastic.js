var Mocha = require('mocha');
var fs = require('fs');
const https = require('https');
var request = require('sync-request');

/**
 * A simple UI that only exposes a single function: test
 */
module.exports = Mocha.interfaces['mocha-flaptastic'] = function(suite) {

    // After the listener is registered, this helps us not reregister.
    let configured = false;

    // After the listener is registered, this helps us not reregister.
    let sufficientEnvVars = null;

    let regex = new RegExp("^" + process.cwd() + "/");

    var doPost = function(body) {
        let hostname = 'frontend-api.flaptastic.com'
        let path = "/api/v1/ingest"
        const data = JSON.stringify(body)
        const options = {
            hostname: hostname,
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'Bearer': process.env["FLAPTASTIC_API_TOKEN"]
            }
        }
        const req = https.request(options, (res) => {
            if (res.statusCode != 201) {
                if (verbosityAtLeast(1)) {
                    console.error("Failed to send test results to flaptastic. HTTP code: " + resp.statusCode)
                }
            }
        })

        req.on('error', (error) => {
            if (verbosityAtLeast(1)) {
                console.error(error)
            }
        })

        req.write(data)
        req.end()
    };

    var getMissingRequiredEnvVars = function() {
        let required = [
            'FLAPTASTIC_ORGANIZATION_ID',
            'FLAPTASTIC_API_TOKEN',
            'FLAPTASTIC_BRANCH',
            'FLAPTASTIC_SERVICE'
        ];
        var missing = [];
        for (let i = 0; i < required.length; i++) {
            if (process.env[required[i]] == null) {
                missing.push(required[i])
            }
        }
        return missing;
    };

    var getExceptionSite = function(file, line) {
        var exceptionSite = [];
        var contents = fs.readFileSync(file, 'utf8');
        let fileArray = contents.split("\n")
        for (var i=0; i<fileArray.length; i++) {
            if ((i > line - 5) && (i <= line)) {
                exceptionSite.push({
                    line_number: i+1,
                    line: fileArray[i]
                })
            }
        }
        return exceptionSite;
    };

    var verbosityAtLeast = function(benchmark) {
        let verbosity = process.env["FLAPTASTIC_VERBOSITY"] != undefined ? parseInt(process.env["FLAPTASTIC_VERBOSITY"]) : 0
        return verbosity >= benchmark;
    };

    var deliverFlaps = function(buffer) {
        if (sufficientEnvVars === null) {
            let missingEnvVars = getMissingRequiredEnvVars();
            if (missingEnvVars.length === 0) {
                sufficientEnvVars = true;
                if (verbosityAtLeast(1)) {
                    console.log("Flaptastic plugin activated during this test run.")
                }
            } else {
                if (verbosityAtLeast(1)) {
                    console.error("Flaptastic will not run due to missing env variables: " + missingEnvVars);
                }
                sufficientEnvVars = false;
                return;
            }
        }
        doc = {
            "branch": process.env["FLAPTASTIC_BRANCH"],
            "commit_id": process.env["FLAPTASTIC_COMMIT_ID"] != undefined ? process.env["FLAPTASTIC_COMMIT_ID"] : '',
            "link": process.env["FLAPTASTIC_LINK"] != undefined ? process.env["FLAPTASTIC_LINK"] : '',
            "organization_id": process.env["FLAPTASTIC_ORGANIZATION_ID"] != undefined ? process.env["FLAPTASTIC_ORGANIZATION_ID"] : '',
            "service": process.env["FLAPTASTIC_SERVICE"] != undefined ? process.env["FLAPTASTIC_SERVICE"] : '',
            "timestamp": Math.floor(new Date().valueOf() / 1000),
            "test_results": buffer
        }
        doPost(doc);
    };

    var getSkippedTests = function() {
        if (getMissingRequiredEnvVars().length) {
            return {};
        }
        var url = "https://frontend-api.flaptastic.com/api/v1/skippedtests/" + process.env["FLAPTASTIC_ORGANIZATION_ID"] + "/" + process.env["FLAPTASTIC_SERVICE"];
        try {
            var res = request('GET', url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Bearer': process.env["FLAPTASTIC_API_TOKEN"]
                },
                timeout: 5000
            });
            return JSON.parse(res.getBody('UTF-8'));
        } catch(err) {
            if (verbosityAtLeast(1)) {
                console.log("Failed retrieving skipped tests from flaptastic: " + err)
            }
            return {}
        }
    };

    var skippedTests = getSkippedTests();

    suite.on('pre-require', function(context, file, mocha) {
        if (configured) {
            return;
        }

        let buffer = [];


        context.beforeEach('flaptasticSkipper', function() {
            var fileConfiguration;
            let thisRelativeFileName = this.currentTest.file.replace(regex, '')

            // Determine if this test should be skipped.
            if(skippedTests.hasOwnProperty(thisRelativeFileName)) {
                fileConfiguration = skippedTests[thisRelativeFileName];
                // Loop over the skip configuration for this file to determine
                // if the curren test name is one of the skipped tests.
                for (var i=0; i<fileConfiguration.length; i++) {
                    if (fileConfiguration[i]["name"] == this.currentTest.title) {
                        this.currentTest.skip();
                        break;
                    }
                }
            }
        });

        context.afterEach('flaptasticSkipper', function() {
            var line = 0
            var exception = null;
            var file_stack = [];
            var exception_site = [];
            if (this.currentTest.state == "failed") {
                line = parseInt(this.currentTest.err.stack.match(/:(\d+):/)[1]);
                exception = this.currentTest.err.message
                file_stack.push(this.currentTest.err.stack.match(/\((.*?):/)[1])
                exception_site = getExceptionSite(
                    this.currentTest.file,
                    line
                )
            }
            let relativeFileName = this.currentTest.file.replace(regex, '')
            buffer.push({
                file: relativeFileName,
                line: line,
                name: this.currentTest.title,
                status: this.currentTest.state,
                exception: exception,
                package: null,
                file_stack: file_stack,
                exception_site: exception_site
            });
            if (buffer.length > 10) {
                deliverFlaps(buffer)
                buffer = [];
            }
        });

        context.after('flaptasticSkipper', function() {
            deliverFlaps(buffer)
            buffer = [];
        });

        configured = true;

    });
};
