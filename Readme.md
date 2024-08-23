# OpenBook V2 Crank Script

![OBv2 Crank](https://github.com/user-attachments/assets/2fddad45-20d1-4d74-ba04-6c72c63080b0){ width=800px }

Script for cranking OpenBook V2 markets on Solana.

## Project Structure

```plaintext
.
├── Dockerfile
├── package-lock.json
├── package.json
├── src
│   └── crank.ts
├── tsconfig.json
├── wallet.json
├── .env
└── yarn.lock
```

* **src/crank.ts**: The main script for running the crank operations.
* **package.json**: Contains dependencies and scripts for building and running the project.
* **tsconfig.json**: TypeScript configuration file.
* **wallet.json**: Contains the wallet keypair used to sign transactions.
* **.env**: Configuration file for environment variables.

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

3. **Create and configure the `.env` file**:

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

If you prefer running the script inside a Docker container, you can use the provided `Dockerfile`.

1. **Build the Docker image**:
    ```bash
    docker build -t obv2-crank-v2 .
    ```

2. **Run the Docker container**:
    ```bash
    docker run --env-file .env obv2-crank-v2
    ```

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

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
