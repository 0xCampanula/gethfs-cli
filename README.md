# gethfs-cli

## Installation
### Globally:
```bash
npm install -g gethfs-cli
```

Once installed, you can upload file or directory using:
```
gethfs-cli upload -f <directory|file> -a <address> -p <private-key> -c [chain-id]
```

### Locally:
```bash
npm install gethfs-cli
```

After installation, use npx to run the command:
```
npx gethfs-cli upload -f <directory|file> -a <address> -p <private-key> -c [chain-id]
```
<br/>


## Command
| Short Name | Full Name        | description                                                                                            |   
|------------|------------------|--------------------------------------------------------------------------------------------------------|
| -p         | --privateKey     | private key                                                                                            |
| -a         | --address        | contract address / domain name                                                                         |
| -f         | --file           | upload file path / name                                                                                |
| -c         | --chainId        | chain id                                                                                               |
| -r         | --rpc            | provider url                                                                                           |
|            | --maxFeePerGas | custom max fee per gas for upload transactions, in wei (EIP-1559). Default: `1.1 × network base fee + priority fee` |
|            | --maxPriorityFeePerGas | custom max priority fee per gas for upload transactions, in wei (EIP-1559). Default: `100`            |
|            | --gasPrice | custom gas price for legacy chains without EIP-1559 (e.g. BNB Chain), in wei            |
| -s         | --threadPoolSize | number of threads for concurrent cost estimation and data fetching (chunk transactions are always sent one at a time), default value:<br/>QuarkChain L2: `15`<br/> others: `6` |
| -e         | --estimateGas    | estimate gas                                                                                           |
| -m         | --chunkSize      | data size of each calldata chunk, in KB, default value: `64`                                            |
| -n         | --maxChunkCount  | maximum number of chunks per request, default value: `100`                                              |
 <br/>


## Supported networks
| Chain Name                 | Chain Short Name and Chain Id |
|----------------------------|-------------------------------|
| Ethereum Mainnet           | eth / 1                       | 
| Sepolia Testnet            | sep / 11155111                | 
| Optimism                   | oeth / 10                     | 
| Arbitrum One               | arb1 / 42161                  | 
| BNB Smart Chain            | bnb / 56                      | 
| BNB Smart Chain Testnet    | bnbt / 97                     | 
| Avalanche C-Chain          | avax / 43114                  | 
| Avalanche Fuji Testnet     | fuji / 43113                  | 
| QuarkChain L2 Testnet      | qkc-l2-t / 110011             |
| QuarkChain L2 Mainnet      | qkc-l2 / 100011               |
 

## Usage
### Support EIP-3770 Address
```
Ethereum
    eth:<name|address>
Sepolia
    sep:<name|address>
...    
```
##### Example
```
Ethereum
    eth:ens.eth
Sepolia
    sep:0x1825...2388
...
```
<br/>


### Create FlatDirectory Command
Ethereum is the default network if it's not specified, otherwise, you should use "--chainId" to set it. RPC should also be specified if the network is an unlisted network.
```
gethfs-cli create -p <private-key> -c [chain-id] -r [rpc]

// output: contract address 
```
##### Example
```
gethfs-cli create -p 0x32...
gethfs-cli create -p 0x32... -c 11155111
gethfs-cli create -p 0x32... -r https://rpc.ankr.com/eth
```
<br/>


### Upload Command
Upload files using calldata.<br/>
If you want to use name instead of FlatDirectory address, the name should be pointed to the FlatDirectory 
address in advance. Click [here](https://docs.web3url.io/tutorials-on-ethstorage-early-testnet/bind-domain-names-to-your-flatdirectory) for details.
```
gethfs-cli upload -f <file|directory> -a <address> -p <private-key> -c [chain-id] -r [rpc] --maxFeePerGas [max-fee-per-gas-in-wei] --maxPriorityFeePerGas [max-priority-fee-per-gas-in-wei] --gasPrice [gas-price-in-wei] -e [estimate-gas] -s [thread-pool-size]
```
##### Example
```
FlatDirectory address
  gethfs-cli upload -f index.html -a sep:0x1825...2388 -p 0x32...
  gethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -c 11155111
  gethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -r https://rpc.xxx --maxFeePerGas 30000000000 --maxPriorityFeePerGas 1500000000
  gethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -r https://rpc.xxx -s 12
  gethfs-cli upload -f index.html -a 0x1825...2388 -p 0x32... -r https://rpc.xxx -e
ens
  gethfs-cli upload -f dist -a eth:ens.eth -p 0x32... -r https://rpc.ankr.com/eth
```
<br/>


### Set FlatDirectory Default Entrance
```
gethfs-cli default -a <address|domain> -f <file-name> -p <private-key> -c [chain-id] -r [rpc]
```
##### Example
```
FlatDirectory address
  gethfs-cli default -a sep:0x1825...2388 -f index.html -p 0x32...
  gethfs-cli default -a 0x1825...2388 -f index.html -p 0x32... -c 11155111
  gethfs-cli default -a 0x1825...2388 -f index.html -p 0x32... -r https://rpc.xxx
ens
  gethfs-cli default -a eth:ens.eth -f index.html -p 0x32... -r https://rpc.ankr.com/eth
```
<br/>


### Download File
```
gethfs-cli download -a <address|domain> -f <fileName> -c [chain-id] -r [rpc]
```
##### Example
```
FlatDirectory address
  gethfs-cli download -a sep:0x1825...2388 -f index.html
  gethfs-cli download -a 0x1825...2388 -f index.html -c 11155111
  gethfs-cli download -a 0x1825...2388 -f index.html -r https://rpc.xxx
ens
  gethfs-cli download -a eth:ens.eth -f home.vue
```
<br/>


### Remove File
```
gethfs-cli remove -a <address|domain> -f <file-name> -p <private-key> -r [rpc] -c [chain-id]
```
##### Example
```
FlatDirectory address
  gethfs-cli remove -a sep:0x1825...2388 -f index.html -p 0x32...
  gethfs-cli remove -a 0x1825...2388 -f index.html -p 0x32... -c 11155111
  gethfs-cli remove -a 0x1825...2388 -f index.html -p 0x32... -r https://rpc.xxx
ens
  gethfs-cli remove -a eth:ens.eth -f home.vue -p 0x32...
```
<br/>

### Repo
[Github Repo](https://github.com/ethstorage/ethfs-cli/)
