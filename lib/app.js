function executeTests(projectFolder) {
    var shell = require("shelljs");

    shell.cd(projectFolder);
    shell.rm("-f", "transactions.log");
    shell.exec("truffle develop --log 2> transactions.log", { async: true });
    shell.exec("truffle test");
}

function main(transactionFile, contractsDir) {
    var shell = require("shelljs");
    var fs = require("mz/fs");
    var coverage = require("./coverage.js");
    var generator = require("./generator.js");
    var Web3 = require("web3");

    /* Remove trailing slash. */
    if (contractsDir.slice(-1) == "/")
        contractsDir = contractsDir.slice(0, -1);

    var filePromises = [];
    var skippedFiles = [];
    var binaries = [];
    var contractAddresses = [];

    //skippedFiles.push(`${contractsDir}/Migrations.json`);

    shell.ls(`${contractsDir}/**/*.json`).forEach(file => {
        if (!skippedFiles.includes(file)) {
            let contractPromise = fs.readFile(file, "utf-8").then(function (data) {
                let c = JSON.parse(data);

                let contract = {};
                contract.contractName = c.contractName;
                contract.source = c.source;
                contract.sourcePath = c.sourcePath;
                contract.ast = c.ast;
                contract.binary = c.bytecode;
                contract.sourceMap = c.sourceMap;
                contract.deployedBinary = c.deployedBytecode;
                contract.deployedSourceMap = c.deployedSourceMap;

                return contract;
            });

            filePromises.push(contractPromise);
        }
    });

    let contractPromise = Promise.all(filePromises).then(function (data) {
        return data;
    });

    let tfPromise = fs.readFile(transactionFile, "utf-8").then(function (data) {
        var txs = [];
        var lines = data.split("\n");

        for (var i = 0; i < lines.length; i++) {
            var tx = lines[i].match("Transaction: 0x[a-f0-9]*");
            if (tx) {
                txs.push(tx[0].replace("Transaction: ", ""));
            }

            var ca = lines[i].match("Contract created: 0x[a-f0-9]*");
            if (ca) {
                contractAddresses.push(ca[0].replace("Contract created: ", ""));
            }
        }

        console.log(txs);

        return txs;
    });

    let finalPromise = Promise.all([contractPromise, tfPromise]).then(function (data) {
        let contracts = data[0];
        let transactions = data[1];
        let covReport = coverage.Initialize(contracts);
        let transactionPromises = [];

        let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:9545"));

        // TODO: do this in a promise for concurrent execution.
        for (var i = 0; i < transactions.length; i++) {
            console.log("test");
            //let t = web3.eth.getTransaction(transactions[i]);
            let t = null;
            //console.log(`${i}/${transactions.length}: ${transactions[i]} | ${t}`);
            transactionPromises.push(generator.CoverTransaction(transactions[i], contracts, covReport));
            if (t) {
                let to = t.to;
                console.log(`${i}/${transactions.length}: ${transactions[i]} | ${to}`);

                /* Make sure the transaction is a valid transaction. */
                if (to !== "0x0" && contractAddresses.includes(to)) {
                    console.log("to: " + to);
                    console.log(transactions[i]);
                    transactionPromises.push(generator.CoverTransaction(transactions[i], contracts, covReport));
                }
            }
        }

        Promise.all(transactionPromises.map(p => p.catch(e => e))).then(function (data) {
            console.log(data);
            console.log(coverage.Compute(covReport));
        });
    });
}

main(process.argv[2], process.argv[3]);
