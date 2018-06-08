const coverage = {};

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
            lines.end = sourceMap[sourceMap.length - 1];
        }

        lines.start.line++;
        lines.end.line++;

        stmts.s[ast.id] = 0;
        stmts.statementMap[ast.id] = lines;
        stmts.sourceToIdMap[ast.src] = ast.id;

        if (ast.nodeType == "FunctionDefinition") {
            stmts.f[ast.id] = 0;
            stmts.fnMap[ast.id] = lines;
        }

        if (parent != null) {
            stmts.parentMap[ast.id] = parent.id;
        }
    }


    for (var key in ast) {
        if (typeof ast[key] === "object") {
            walkAst(ast[key], ast, sourceMap, stmts);
        }
    }
}

/*
 * coverage.Initialize
 *
 * Initializes a coverage object for a contract.
 *
 * @param contract the contract object
 * @returns a coverage object for the contract
 */
coverage.Initialize = function coverageInitialize(contracts) {
    var SolidityUtils = require("truffle-solidity-utils");

    let coverage = {};

    for (var i = 0; i < contracts.length; i++) {
        let contract = contracts[i];
        console.log(contract.sourcePath);

        coverage[contract.sourcePath] = {};
        coverage[contract.sourcePath].path = contract.sourcePath;
        coverage[contract.sourcePath].s = {};
        coverage[contract.sourcePath].b = {};
        coverage[contract.sourcePath].f = {};
        coverage[contract.sourcePath].statementMap = {};
        coverage[contract.sourcePath].branchMap = {};
        coverage[contract.sourcePath].fnMap = {};
        coverage[contract.sourcePath].parentMap = {};
        coverage[contract.sourcePath].sourceToIdMap = {};

        var sourceMap = SolidityUtils.getCharacterOffsetToLineAndColumnMapping(contract.source);
        walkAst(contract.ast, null, sourceMap, coverage[contract.sourcePath]);
    }

    return coverage;
};

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

/*
 * coverage.Compute
 *
 * Computes the statement and function coverage
 *
 * @params coverage the coverage object
 * @returns the statement and function coverage
 */
coverage.Compute = function coverageCompute(coverage) {
    var totalReport = {};

    for (var i in coverage) {
        totalReport[coverage[i].path] = {
            "Statements": computeStatementCoverage(coverage[i]),
            "Functions": computeFunctionCoverage(coverage[i])
        };
    }

    return totalReport;
};

module.exports = coverage;
