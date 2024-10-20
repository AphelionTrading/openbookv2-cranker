<p align="center">
  <img src="https://github.com/user-attachments/assets/61b1a716-61d8-4826-9d2d-f7c4e70563d0" alt="OBv2 Crank" width="600" style="border: 2px solid #000; padding: 10px; margin: 20px; background-color: #fff;"/>
</p>

# OpenBook v2 Crank v2 Script

Script for cranking OpenBook V2 markets on Solana.

## Project Structure

```plaintext
.
├── dist
├── node_modules
├── src
│   └── crank.ts
├── .env
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
├── wallet.json
└── yarn.lock
```

* **dist**: Contains the transpiled scripts.
* **src/crank.ts**: The main script for running the crank operations.
* **.env**: Configuration file for environment variables.
* **.env.example**: Example .env file.
* **package.json**: Contains dependencies and scripts for building and running the project.
* **tsconfig.json**: TypeScript configuration file.
* **wallet.json**: Contains the wallet keypair used to sign transactions.

## Prerequisites

Before you can run this project, ensure you have the following installed:

* [Node.js](https://nodejs.org/) (v14.x or later)
* [Yarn](https://yarnpkg.com/)
* [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (optional, for managing Solana wallets)

## Installation

1. **Clone the repository**:
    ```bash
    git clone https://github.com/TheDeFiQuant/obv2-crank-v2.git
    cd obv2-crank-v2
    ```

2. **Install dependencies**:
    ```bash
    yarn install
    ```

3. **Copy .env.example to .env and configure the file**:

    The `.env` file should be located in the root directory of your project (where your `package.json` is). Here’s an example of what your `.env` file should look like:

    ```env
    CLUSTER=mainnet
    RPC_URL=https://solana-mainnet.rpc-node.com/your-api-key
    WALLET_PATH=/path/to/your/wallet.json
    KEYPAIR= # Leave this empty if you use wallet.json or enter your private keypair in JSON format
    PROGRAM_ID=opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb
    INTERVAL=1000
    CONSUME_EVENTS_LIMIT=19
    MARKETS=marketID1,marketID2,marketID3
    PRIORITY_MARKETS=marketID1,marketID2,marketID3
    PRIORITY_QUEUE_LIMIT=100
    PRIORITY_CU_PRICE=100000
    PRIORITY_CU_LIMIT=50000
    MAX_TX_INSTRUCTIONS=1
    CU_PRICE=0
    ```

    - **RPC_URL**: Add the URL of your Solana RPC node.
    - **WALLET_PATH**: Path to your `wallet.json`. See how to generate a wallet.json [here](https://docs.solanalabs.com/cli/wallets/file-system).
    - **KEYPAIR**: (Optional) Enter your private keypair (same format as in wallet.json). Leave this empty if using `wallet.json`.
    - **MARKETS**: Comma-separated list of market IDs to crank.
    - **PRIORITY_MARKETS**: Comma-separated list of market IDs that receive fee bumps.
    - **MIN_EVENTS**: (Optional) Set the threshold for the number of events before cranker will send a TX.
  
## Configuration

### Environment Variables

The script relies on several environment variables defined in the `.env` file:

- **CLUSTER**: Cluster to use. Options: `mainnet`, `testnet`, `devnet`. Default is `mainnet`.
- **RPC_URL**: RPC endpoint URL for the Solana cluster.
- **WALLET_PATH**: Path to your Solana wallet JSON file.
- **KEYPAIR**: Private keypair in JSON format. Optional if using `WALLET_PATH`.
- **PROGRAM_ID**: Program ID for OpenBook. Default is set for mainnet.
- **INTERVAL**: Time interval in milliseconds between each loop. Default is `1000 ms`.
- **CONSUME_EVENTS_LIMIT**: Maximum number of events to consume per transaction. Default is `19`.
- **MARKETS**: Comma-separated list of market IDs to crank.
- **PRIORITY_MARKETS**: Market IDs that receive priority fees. Comma-separated.
- **PRIORITY_QUEUE_LIMIT**: Queue size threshold to apply priority fees. Default is `100`.
- **PRIORITY_CU_PRICE**: Compute unit price for priority markets. Default is `100000`.
- **PRIORITY_CU_LIMIT**: Compute unit limit per instruction. Default is `50000`.
- **MAX_TX_INSTRUCTIONS**: Maximum number of instructions per transaction. Default is `1`.
- **CU_PRICE**: Minimum additional micro lamports for all transactions. Default is `0`.

## Usage

1. **Compile the TypeScript code**:
    ```bash
    yarn build
    ```

2. **Run the script**:
    ```bash
    yarn start
    ```

   Alternatively, you can run the script directly with `ts-node`:
   
   ```bash
   yarn dev

## Docker Support

If you prefer running the script inside a Docker container, you can pull the image from GHCR.

1. **Ensure you have the following files in your current working directory:**:
   ```bash
   .env
   wallet.json
    ```

2. **Run the Docker container with the latest image**:
    ```bash
   docker run --pull=always --env-file .env --rm --name obv2-crank -v ./wallet.json:/app/wallet.json ghcr.io/solpkr1/obv2-crank:latest
    ```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
