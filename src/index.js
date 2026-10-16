const fs = require('fs');
const path = require('path');
const ora = require("ora");
const readline = require('readline');
const { FlatDirectory, MAX_CHUNKS, DEFAULT_MAX_CHUNK_SIZE_KB } = require("calldatauploader-sdk");
const { ethers } = require("ethers");
const {
  PROVIDER_URLS,
  ETHEREUM_CHAIN_ID,
  QUARKCHAIN_L2_DELTA_CHAIN_ID,
  QUARKCHAIN_L2_MAINNET_CHAIN_ID,
  DEFAULT_THREAD_POOL_SIZE_LOW,
  DEFAULT_THREAD_POOL_SIZE_HIGH
} = require('./params');
const {
  isPrivateKey,
  getChainIdByRpc,
  getWebHandler,
  Uploader,
  Logger,
  createSDK
} = require('./utils');

const color = require('colors-cli/safe');
const error = color.red.bold;

const CHAIN_ID_DEFAULT = ETHEREUM_CHAIN_ID;

// **** external function ****
const createDirectory = async (key, chainId, rpc) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }

  // get chain id
  if (chainId) {
    chainId = Number(chainId);
    const rpcChainId = await getChainIdByRpc(rpc);
    if (rpcChainId && rpcChainId !== chainId) {
      Logger.error(`Chain ID conflict: provided (${chainId}) vs RPC (${rpcChainId}).`);
      return;
    }
  } else if (rpc) {
    chainId = await getChainIdByRpc(rpc);
  } else {
    chainId = CHAIN_ID_DEFAULT;
  }

  // get rpc
  const providerUrl = rpc || PROVIDER_URLS[chainId];
  if (!providerUrl) {
    Logger.error("RPC is required for the network. Please provide an RPC and try again.");
    return;
  }

  Logger.info(`Using chainId: ${chainId}`);
  Logger.info(`Using provider URL: ${providerUrl}`);
  Logger.log('');
  const fd = await FlatDirectory.create({
    rpc: providerUrl,
    privateKey: key,
  });
  const address = await fd.deploy();
  if (address) Logger.success("Deployment successful.");
};

const setDefault = async (key, domain, filename, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain or address.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId);
  if (!handler) return;

  const { providerUrl, address } = handler;
  const fd = await createSDK(providerUrl, key, address);
  if (!fd) return;

  const status = await fd.setDefault(filename);
  if (status) Logger.success("Default file set successfully.");
};

const remove = async (key, domain, fileName, rpc, chainId) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain address.");
    return;
  }
  if (!fileName) {
    Logger.error("Invalid file name.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId);
  if (!handler) return;

  Logger.info(`Removing file: ${fileName}`);
  const { providerUrl, address } = handler;
  const fd = await createSDK(providerUrl, key, address);
  if (!fd) return;

  const status = await fd.remove(fileName);
  if (status) Logger.success("File removed successfully.");
}

const download = async (domain, fileName, rpc, chainId) => {
  if (!domain) {
    Logger.error("Invalid domain address.");
    return;
  }
  if (!fileName) {
    Logger.error("Invalid file name.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId, false);
  if (!handler) return;

  // Resolve within cwd: block path traversal (fileName comes from an on-chain key).
  const cwd = process.cwd();
  const savePath = path.resolve(cwd, fileName);
  if (savePath !== cwd && !savePath.startsWith(cwd + path.sep)) {
    Logger.error("Invalid file name: path escapes the current directory.");
    return;
  }
  // appendFileSync is used per chunk; an existing file would be corrupted by appending.
  if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
  fs.mkdirSync(path.dirname(savePath), { recursive: true });

  // replace rpc to eth storage
  const fd = await createSDK(handler.providerUrl, ethers.hexlify(ethers.randomBytes(32)), handler.address, handler.providerUrl);
  if (!fd) {
    return;
  }

  await fd.download(fileName, {
    onProgress: (progress, count, chunk) => {
      fs.appendFileSync(savePath, chunk);
      Logger.log(`Download progress: ${progress} / ${count}`);
    },
    onFail: (e) => {
      fs.unlink(savePath, () => {});
      Logger.error(`Download failed: ${e.message}`);
    },
    onFinish: () => {
      Logger.success(`Download complete: ${savePath}`);
    }
  });
}

const estimateAndUpload = async (key, domain, path, rpc, chainId, maxFeePerGas, maxPriorityFeePerGas, gasPrice, threadPoolSize, estimateGas, chunkSize, maxChunkCount) => {
  if (!isPrivateKey(key)) {
    Logger.error("Invalid private key.");
    return;
  }
  if (!domain) {
    Logger.error("Invalid domain or address.");
    return;
  }
  if (!path) {
    Logger.error("Invalid file path.");
    return;
  }
  if (!fs.existsSync(path)) {
    Logger.error("File or folder does not exist.");
    return;
  }
  // Custom gas fees, in wei: EIP-1559 fields for EIP-1559 chains, gasPrice for legacy
  // chains (e.g. BNB Chain). Integers only; unset values fall back to chain defaults.
  const gasFee = {};
  const parseWei = (name, value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (!/^\d+$/.test(String(value))) {
      Logger.error(`Invalid ${name}. Please provide a positive integer in wei.`);
      return null;
    }
    const wei = BigInt(value);
    if (wei <= 0n) {
      Logger.error(`Invalid ${name}. Please provide a positive integer in wei.`);
      return null;
    }
    return wei;
  };
  if (maxFeePerGas !== undefined) {
    const v = parseWei('maxFeePerGas', maxFeePerGas);
    if (v === null) return;
    gasFee.maxFeePerGas = v;
  }
  if (maxPriorityFeePerGas !== undefined) {
    const v = parseWei('maxPriorityFeePerGas', maxPriorityFeePerGas);
    if (v === null) return;
    gasFee.maxPriorityFeePerGas = v;
  }
  if (gasPrice !== undefined) {
    const v = parseWei('gasPrice', gasPrice);
    if (v === null) return;
    gasFee.gasPrice = v;
  }
  chunkSize = chunkSize ? Number(chunkSize) : DEFAULT_MAX_CHUNK_SIZE_KB;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    Logger.error("Invalid chunk size. Please provide a positive integer, in KB.");
    return;
  }
  maxChunkCount = maxChunkCount ? Number(maxChunkCount) : MAX_CHUNKS;
  if (!Number.isInteger(maxChunkCount) || maxChunkCount <= 0) {
    Logger.error("Invalid max chunk count. Please provide a positive integer.");
    return;
  }

  const handler = await getHandler(domain, rpc, chainId, false);
  if (!handler) return;

  // Batch processing limit (chunk transactions are always sent strictly one at a time)
  let batchFetchLimit;
  if (threadPoolSize) {
    batchFetchLimit = Number(threadPoolSize);
  } else if (handler.chainId === QUARKCHAIN_L2_DELTA_CHAIN_ID || handler.chainId === QUARKCHAIN_L2_MAINNET_CHAIN_ID) {
    batchFetchLimit = DEFAULT_THREAD_POOL_SIZE_HIGH;
  } else {
    batchFetchLimit = DEFAULT_THREAD_POOL_SIZE_LOW;
  }
  Logger.info(`Thread pool size: ${batchFetchLimit}`);
  Logger.info(`Chunk size: ${chunkSize} KB`);
  Logger.info(`Max chunk count: ${maxChunkCount}`);
  if (gasFee.maxFeePerGas !== undefined) Logger.info(`Max fee per gas: ${gasFee.maxFeePerGas} wei`);
  if (gasFee.maxPriorityFeePerGas !== undefined) Logger.info(`Max priority fee per gas: ${gasFee.maxPriorityFeePerGas} wei`);
  if (gasFee.gasPrice !== undefined) Logger.info(`Gas price: ${gasFee.gasPrice} wei`);
  Logger.log('');

  // query total cost
  const uploader = await Uploader.create(key, handler.providerUrl, handler.address, chunkSize, maxChunkCount);
  if (!uploader) {
    process.exit(1);
  }

  if (estimateGas) {
    // get cost
    await estimateCost(uploader, path, gasFee, batchFetchLimit);
    if (!(await answer("Continue?"))) return;
  }

  // upload
  await upload(uploader, path, gasFee, batchFetchLimit);
  process.exit(0);
}
// **** external function ****

// **** internal function ****

const answer = async (text) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(text + ' (y/n) ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'Y' || answer.toLowerCase() === '');
    });
  });
}

const estimateCost = async (uploader, path, gasFee, threadPoolSize) => {
  const spin = ora('Start estimating cost').start();
  try {
    const cost = await uploader.estimateCost(spin, path, gasFee, threadPoolSize);
    spin.succeed('Estimating cost progress: 100%');

    Logger.log('');
    Logger.info(`Total files: ${error(cost.totalFileCount.toString())}`);
    Logger.info(`Expected gas cost: ${error(ethers.formatEther(cost.totalGasCost))} ETH`);
    Logger.info(`Total estimated cost: ${error(ethers.formatEther(cost.totalStorageCost + cost.totalGasCost))} ETH`);
    Logger.info(`Note: gas is estimated from the current block base fee; the actual cost varies with network conditions.`);
  } catch (e) {
    Logger.log('');
    const length = e.message.length;
    Logger.log(length > 400 ? (e.message.substring(0, 200) + " ... " + e.message.substring(length - 190, length)) : e.message);
    Logger.error(e.value ? `Estimate gas failed, the failure file is ${e.value}` : 'Estimate gas failed');
  } finally {
    spin.stop();
  }
}

const upload = async (uploader, path, gasFee, batchFetchLimit) => {
  try {
    const infoArr = await uploader.upload(path, gasFee, batchFetchLimit);
    Logger.log('');
    let totalCost = 0n, totalChunkCount = 0, totalDataSize = 0;
    for (const file of infoArr) {
      if (file.currentSuccessIndex >= 0) {
        totalCost += file.totalCost;
        totalChunkCount += file.totalUploadCount;
        totalDataSize += file.totalUploadSize;
        if (file.totalChunkCount > file.currentSuccessIndex + 1) {
          Logger.error(`${file.fileName} upload failed at chunk ${file.currentSuccessIndex + 1}`);
        }
      } else {
        Logger.error(`${file.fileName} upload failed.`);
      }
    }

    Logger.log('');
    Logger.success(`Total files: ${infoArr.length}`);
    Logger.success(`Total chunks uploaded: ${totalChunkCount}`);
    Logger.success(`Total data uploaded: ${totalDataSize} KB`);
    Logger.success(`Total cost: ${ethers.formatEther(totalCost)} ETH`);
  } catch (e) {
    // stableRetry wraps the original error, so inspect the whole cause chain.
    const errText = `${e?.code ?? ''} ${e?.cause?.code ?? ''} ${e?.message ?? ''} ${e?.cause?.message ?? ''} ${e?.error?.message ?? ''}`;
    if (errText.includes("REPLACEMENT_UNDERPRICED") || /replacement fee too low|replacement transaction underpriced/i.test(errText)) {
      // replace error
      Logger.multi([
        { color: 'error', text: '❕️ Pending transaction detected for this wallet. \n' },
        { color: 'error', text: "Your replacement transaction cannot override the queued tx because the gas is too low.\n" },
        { color: 'error', text: "👉 Please restart the command with higher " },
        { color: 'success', text: "--maxFeePerGas <wei> " },
        { color: 'error', text: "and/or " },
        { color: 'success', text: "--maxPriorityFeePerGas <wei>" },
        { color: 'error', text: " values (a replacement must bid at least ~10% higher than the queued transaction).\n" }
      ]);
    } else {
      const length = e.message.length;
      Logger.error(length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message);
      if (e.value) Logger.error(`The failure file is ${e.value}`);
      Logger.error(`Execution failed. Please check the error message and try again after making necessary adjustments.`);
    }
  }
};

const getHandler = async (domain, rpc, chainId, isBr = true) => {
  const handler = await getWebHandler(domain, rpc, chainId, CHAIN_ID_DEFAULT, isBr);
  if (handler && !handler?.providerUrl || parseInt(handler?.address) <= 0) {
    return null;
  }
  return handler;
};
// **** internal function ****

module.exports.upload = estimateAndUpload;
module.exports.create = createDirectory;
module.exports.remove = remove;
module.exports.setDefault = setDefault;
module.exports.download = download;
