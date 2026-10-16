const { from, mergeMap, concatMap, map, scan, filter } = require('rxjs');
const {
    MAX_CHUNKS,
    DEFAULT_MAX_CHUNK_SIZE_KB,
    toChunkSizeBytes
} = require("gethstorage-sdk");
const {NodeFile} = require("gethstorage-sdk/file");

const { recursiveFiles, createSDK } = require('./utils');
const { Logger } = require('./log');


class UploadError extends Error {
    constructor(message, value) {
        super(message);
        this.name = "UploadError";
        this.value = value;
    }
}

class Uploader {
    #flatDirectory;
    #chunkSizeKB;
    #maxChunkCount;

    static async create(pk, rpc, contractAddress, chunkSizeKB, maxChunkCount) {
        const uploader = new Uploader();
        const status = await uploader.#init(pk, rpc, contractAddress, chunkSizeKB, maxChunkCount);
        if (status) {
            return uploader;
        }
        return null;
    }

    async #init(pk, rpc, contractAddress, chunkSizeKB, maxChunkCount) {
        this.#chunkSizeKB = chunkSizeKB || DEFAULT_MAX_CHUNK_SIZE_KB;
        this.#maxChunkCount = maxChunkCount || MAX_CHUNKS;
        this.#flatDirectory = await createSDK(rpc, pk, contractAddress);
        if (!this.#flatDirectory) {
            return false;
        }
        return true;
    }

    async #fetchFileDataBatch(fileBatch) {
        const keys = fileBatch.map(file => file.name);
        const fileHashArr = await this.#flatDirectory.fetchHashes(keys, this.#maxChunkCount);
        return fileBatch.map(file => {
            file.chunkHashes = fileHashArr[file.name];
            return file;
        })
    }

    #getFileChunkCount(fileSize) {
        // Keep the chunking rule consistent with the SDK
        const chunkDataSize = toChunkSizeBytes(this.#chunkSizeKB);
        if (fileSize > chunkDataSize) {
            // Data needs to be sliced if the file is larger than the chunk data size
            return Math.ceil(fileSize / chunkDataSize);
        }
        return 1;
    }

    #groupFiles(files) {
        return from(files).pipe(
            scan((acc, file) => {
                const newFiles = [...acc.files, file];
                const totalChunks = acc.totalChunks + this.#getFileChunkCount(file.size);
                const totalFileCount = acc.totalFileCount + 1;

                if (totalChunks >= this.#maxChunkCount || totalFileCount === files.length) {
                    return { files: [], totalChunks: 0, totalFileCount, batch: newFiles };
                }
                return { files: newFiles, totalChunks, totalFileCount, batch: [] };
            }, { files: [], totalChunks: 0, totalFileCount: 0, batch: [] }),
            filter(acc => acc.batch.length > 0), // Intercept unpacked data
            map(acc => acc.batch)
        );
    }

    // estimate cost
    async estimateCost(spin, path, gasFee, threadPoolSize) {
        let totalFileCount = 0;
        let totalStorageCost = 0n;
        let totalGasCost = 0n;
        // Execution
        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            this.#groupFiles(files) // Pack files into n groups
                .pipe(
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), threadPoolSize),
                    mergeMap(files => from(files)), // Split a group of files into a single emission
                    mergeMap(info => this.#estimate(info, gasFee), threadPoolSize)
                )
                .subscribe({
                    next: (cost) => {
                        totalFileCount++;
                        totalStorageCost += cost.storageCost;
                        totalGasCost += cost.gasCost;
                        spin.text = `Estimating cost progress: ${Math.ceil(totalFileCount / files.length * 100)}%`;
                    },
                    error: (error) => { reject(error) },
                    complete: () => {
                        resolve({
                            totalFileCount,
                            totalStorageCost,
                            totalGasCost,
                        });
                    }
                });
        });
    }

    async #estimate(fileInfo, gasFee) {
        try {
            const {path, name, chunkHashes} = fileInfo;
            const file = new NodeFile(path);
            return await this.#flatDirectory.estimateCost({
                key: name,
                content: file,
                chunkHashes: chunkHashes,
                maxFeePerGas: gasFee.maxFeePerGas,
                maxPriorityFeePerGas: gasFee.maxPriorityFeePerGas,
                gasPrice: gasFee.gasPrice,
                maxChunkSize: this.#chunkSizeKB,
                maxChunks: this.#maxChunkCount
            });
        } catch (e) {
            throw new UploadError(e.message, fileInfo.name);
        }
    }


    // upload
    async upload(path, gasFee, batchFetchLimit) {
        const results = [];
        // Execution
        const files = recursiveFiles(path, '');
        return new Promise((resolve, reject) => {
            this.#groupFiles(files)
                .pipe(
                    mergeMap(fileBatch => this.#fetchFileDataBatch(fileBatch), batchFetchLimit),
                    mergeMap(files => from(files)),
                    // Strictly sequential: a file's chunk transactions must all confirm
                    // before the next file starts uploading.
                    concatMap(info => this.#upload(info, gasFee))
                )
                .subscribe({
                    next: (info) => { results.push(info); },
                    error: (error) => { reject(error); },
                    complete: () => { resolve(results); }
                });
        });
    }

    async #upload(fileInfo, gasFee) {
        const {path, name, chunkHashes} = fileInfo;

        let totalChunkCount = 0;
        let currentSuccessIndex = -1;
        let totalUploadCount = 0;
        let totalUploadSize = 0;
        let totalCost = 0n;

        const callback = {
            onProgress: (progress, count, isChange) => {
                const indexArr = [];
                for (let i = currentSuccessIndex + 1; i <= progress; i++) {
                    indexArr.push(i);
                }
                if (isChange) {
                    Logger.log(`FlatDirectory: Chunks ${indexArr.join(',')} have been uploaded for ${name}.`);
                } else {
                    Logger.log(`FlatDirectory: Chunks ${indexArr.join(',')} have not been changed for ${name}.`);
                }
                currentSuccessIndex = progress;
                totalChunkCount = count;
            },
            onFail: (e) => {
                const length = e.message.length;
                console.log(`${length > 500 ? (e.message.substring(0, 245) + " ... " + e.message.substring(length - 245, length)) : e.message}`, name);
            },
            onFinish: (chunks, size, cost) => {
                totalUploadCount = chunks;
                totalUploadSize = size;
                totalCost = cost;
                const skipped = totalChunkCount - chunks;
                if (skipped > 0 && currentSuccessIndex === totalChunkCount - 1) {
                    Logger.log(`FlatDirectory: ${skipped}/${totalChunkCount} chunks of ${name} already exist on-chain, skipped.`);
                }
            }
        };

        const file = new NodeFile(path);
        try {
            await this.#flatDirectory.upload({
                key: name,
                content: file,
                chunkHashes: chunkHashes,
                maxFeePerGas: gasFee.maxFeePerGas,
                maxPriorityFeePerGas: gasFee.maxPriorityFeePerGas,
                gasPrice: gasFee.gasPrice,
                maxChunkSize: this.#chunkSizeKB,
                maxChunks: this.#maxChunkCount,
                callback: callback
            });
        } catch (e) {
            throw new UploadError(e.message, name);
        }
        return {
            fileName: name,
            totalChunkCount: totalChunkCount,
            currentSuccessIndex: currentSuccessIndex,
            totalUploadCount: totalUploadCount,
            totalUploadSize: totalUploadSize / 1024,
            totalCost: totalCost,
        };
    }
}

module.exports = {
    Uploader
}
