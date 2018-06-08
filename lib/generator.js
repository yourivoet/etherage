const generator = {};

function increment(hash, key) {
    if (!hash[key])
        hash[key] = 1;
    else
        hash[key]++;
}

function rangeToSrc(range) {
    return range.start + ":" + range.length + ":1";
}

/*
 * generator.ProcessTransaction
 *
 * Processes the statements that got covered in a transaction.
 *
 * @param coverage the coverage object containing all coverage information for this contract
 * @param stmts the covered statements
 */
generator.ProcessTransaction = function generatorProcessTransaction(coverage, stmts) {
    for (var i = 0; i < stmts.length; i++) {
        var stmt = stmts[i];

        if (!stmt.file)
            continue;

        //var cur = coverage[stmt.file].sourceToIdMap[stmt.src];
        var cur = stmt.node.id;

        /* Function coverage. */
        if (coverage[stmt.file].f[cur] >= 0) {
            increment(coverage[stmt.file].f, cur);
        }

        /* Statement coverage. */
        while (coverage[stmt.file].statementMap[cur]) {
            increment(coverage[stmt.file].s, cur);
            cur = coverage[stmt.file].parentMap[cur];
        }
    }
};

/*
 * generator.GenerateTransaction
 *
 * Executes a transaction using the Truffle Debugger to generate covered statements.
 *
 * @param transactionHash
 * @param contract the contract object
 * @returns a promise which returns the covered statements
 */
generator.GenerateTransaction = function generatorGenerateTransaction(transactionHash, contracts) {
    var Debugger = require("truffle-debugger");
    var Web3 = require("web3");

    let { ast, data, evm, solidity, trace } = Debugger.selectors;

    var stmts = [];

    let promise = Debugger.forTx(transactionHash, {
        provider: new Web3.providers.HttpProvider("http://127.0.0.1:9545"),
        contracts: contracts
    }).then(function(bugger) {
        return bugger.connect();
    }).then(function(session) {
        console.log(`Processing ${transactionHash}`);
        while (!session.finished) {
            //console.log(session.view(ast.current.node));
            let sourceRange = session.view(solidity.current.sourceRange);
            stmts.push({
                file: session.view(solidity.current.source).sourcePath,
                node: session.view(ast.current.node),
                src: rangeToSrc(sourceRange)
            });

            session.advance();
        }

        return stmts;
    }).catch(function (err) {
        console.log("Error in GenerateTransaction");
    });

    return promise;
};

/*
 * generator.CoverTransaction
 *
 * Covers a transaction and generates the coverage information.
 *
 * @param transactionHash
 * @param contract the contract object
 * @param coverage the coverage object
 * @returns a promise with the updated coverage information
 */
generator.CoverTransaction = function generatorCoverTransaction(transactionHash, contracts, coverage) {
    let promise = generator.GenerateTransaction(transactionHash, contracts).then(function(stmts) {
        generator.ProcessTransaction(coverage, stmts);
        return { [transactionHash]: true };
    }).catch(function (err) {
        console.log(err);
        return { [transactionHash]: false };
    });

    return promise;
};

module.exports = generator;
