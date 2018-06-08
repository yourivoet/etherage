function walkAst(ast, parent, sourceMap, stmts) {
    if (!ast)
        return;

    if (ast.id && ast.src) {
        var lines = {};
        var src = ast.src.split(":");
        lines.start = sourceMap[parseInt(src[0])];
        lines.end = {};
        lines.end = sourceMap[parseInt(src[0]) + parseInt(src[1])];

        if (!lines.end) {
            lines.end = sourceMap[parseInt(src[0]) + parseInt(src[1]) - 1];
        }

        lines.start.line++;
        lines.end.line++;

        stmts.s[ast.id] = 0;
        stmts.statementMap[ast.id] = lines;

        if (ast.nodeType == "FunctionDefinition") {
            stmts.f[ast.id] = 0;
            stmts.fnMap[ast.id] = lines;
        }

        if (parent != null) {
            stmts.parentMap[ast.id] = parent.id;
        }

        ast.parent = parent;
    }


    for (var key in ast) {
        if (typeof ast[key] === "object" && key != "parent") {
            walkAst(ast[key], ast, sourceMap, stmts);
        }
    }
}

function computeStatementCoverage(cov) {
    var stmts = 0;
    var total = 0;

    for (var i in cov.s) {
        if (cov.s[i] > 0) {
            stmts += 1;
        }

        total += 1;
    }

    var stmtCov = {};
    stmtCov.covered = stmts;
    stmtCov.total = total;
    stmtCov.percentage = stmts / total;

    return stmtCov;
}

function computeFunctionCoverage(cov) {
    var funs = 0;
    var total = 0;

    for (var i in cov.f) {
        if (cov.f[i] > 0) {
            funs += 1;
        }

        total += 1;
    }

    var funCov = {};
    funCov.covered = funs;
    funCov.total = total;
    funCov.percentage = funs / total;

    return funCov;
}

function increment(hash, key) {
    if (!hash[key])
        hash[key] = 1;
    else
        hash[key]++;
}

function run_debug(hash, compiled_file, source_file) {
    var OS = require("os");
    var fs = require("mz/fs");
    var path = require("path");
    var safeEval = require('safe-eval');
    var util = require("util");
    var _ = require("lodash");

    var istanbul = require("istanbul");
    var collector = new istanbul.Collector();
    var reporter = new istanbul.Reporter();

    var compile = require("truffle-compile");
    var Config = require("truffle-config");
    var Debugger = require("truffle-debugger");
    var DebugUtils = require("truffle-debug-utils");
    var SolidityUtils = require("truffle-solidity-utils");
    var selectors = require("truffle-debugger").selectors;
    var Web3 = require("web3");
    var web3 = new Web3();

    // Debugger Session properties
    var ast = selectors.ast;
    var data = selectors.data;
    var trace = selectors.trace;
    var solidity = selectors.solidity;
    var evm = selectors.evm;

    var txHash = hash;

    var lastCommand = "n";
    var enabledExpressions = new Set();
    var breakpoints = [];

    var stmts = [];

    let file = fs.readFile(compiled_file, "utf-8");

    var cov_report = {};
    var coverage = {};

    cov_report[source_file] = coverage;
    coverage["path"] = source_file;
    coverage["s"] = {};
    coverage["b"] = {};
    coverage["f"] = {};
    coverage["fnMap"] = {};
    coverage["statementMap"] = {};
    coverage["branchMap"] = {};
    coverage["parentMap"] = {};


    file.then(function (data) {
        let contract = JSON.parse(data);

        fs.readFile(source_file, "utf-8").then(function (source) {
            debug(contract, source);
        });
    }).catch(err => console.error(err));

    async function debug(contract, contract_source) {
        var sourceMap = SolidityUtils.getCharacterOffsetToLineAndColumnMapping(contract_source);
        var new_ast = JSON.parse(JSON.stringify(contract.ast));
        walkAst(new_ast, null, sourceMap, coverage);

        let session = Debugger.forTx(txHash, {
            provider: new Web3.providers.HttpProvider("http://localhost:9545"),
            contracts: [
                {
                    contractName: contract.contractName,
                    source: contract_source,
                    sourcePath: contract.sourcePath,
                    ast: contract.ast,
                    binary: contract.bytecode,
                    sourceMap: contract.sourceMap,
                    deployedBinary: contract.deployedBytecode,
                    deployedSourceMap: contract.deployedSourceMap
                }]
        });

        session.then(function(a) {
            return a.connect();
        }).then(function(session) {

            while (!session.finished) {
                stmts.push({
                    lines: session.view(solidity.next.sourceRange).lines,
                    node: session.view(ast.next.node)
                });

                session.stepInto();
            }

            var sourceLines = contract_source.split('\n');

            for (var i = 0; i < stmts.length; i++) {
                var stmt = stmts[i];
                var start = stmts[i].lines.start;
                var end = stmts[i].lines.end;

                var startLine = sourceLines[start.line];
                var endLine = sourceLines[end.line];

                var cur = stmt.node.id;
                while (coverage.statementMap[cur]) {
                    increment(coverage.s, cur);
                    cur = coverage.parentMap[cur];
                }

                if (stmt.node.nodeType == "FunctionDefinition") {
                    increment(coverage.f, stmt.node.id);
                }
            }

            console.log(cov_report);
            console.log("Statements", computeStatementCoverage(coverage));
            console.log("Functions", computeFunctionCoverage(coverage));

            //collector.add(cov_report);

            //reporter.add("text");
            //reporter.addAll(["lcov"]);
            //reporter.write(collector, false, function () {
            //    console.log("All reports generated");
            //});
            return session;
        });
    }
}

run_debug(process.argv[2], process.argv[3], process.argv[4]);
