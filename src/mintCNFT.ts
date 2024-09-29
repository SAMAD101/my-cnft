import {
    mplBubblegum,
    createTree,
    mintToCollectionV1,
    parseLeafFromMintToCollectionV1Transaction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
    createNft,
    mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
    generateSigner,
    createSignerFromKeypair,
    Signer,
    Umi,
    some,
    percentAmount,
    publicKey,
    PublicKey,
    signerIdentity,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

import bs58 from "bs58";
import dotenv from "dotenv";

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";

dotenv.config();

const umi = createUmi("https://mainnet.helius-rpc.com/?api-key=f2eb7445-400b-4b50-a355-270a6262a4e7")
    .use(mplBubblegum())
    .use(mplTokenMetadata());

const secretKey = bs58.decode(dotenv.config().parsed!.SECRET_KEY);
const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(signerIdentity(signer));

const cNFTMetadata = (creatorPublicKey: PublicKey) => ({
    name: "Sam's personal cNFT",
    symbol: "SAM",
    uri: "https://gist.githubusercontent.com/SAMAD101/e86910f1aff25e0f23c8b32709436b65/raw/415452149486e6e2623045cf83b1b5000cc228e3/my-cnft-metadata.json",
    sellerFeeBasisPoints: 500,
    creators: [{ address: creatorPublicKey, verified: true, share: 100 }],
    collection: {
        key: null as PublicKey | null,
        verified: false,
    },
});

const collectionMetadata = {
    name: "Sam's personal cNFT collection",
    symbol: "SAMs",
    uri: "https://gist.githubusercontent.com/SAMAD101/e23069ce597483f71b9376f66663d088/raw/ec70da4622c9a79c01a09069435aca503ccf8fa9/my-cnft-collection-metadata.json",
    sellerFeeBasisPoints: 500,
};

async function createMerkleTree() {
    console.log("Creating Merkle Tree...");
    const merkleTree = generateSigner(umi);
    const builder = await createTree(umi, {
        merkleTree,
        maxDepth: 14,
        maxBufferSize: 64,
        public: false,
    });
    await builder.sendAndConfirm(umi);
    console.log("Merkle Tree created with address:", merkleTree.publicKey);

    return merkleTree;
}

async function createCollectionNFT(umi: Umi): Promise<Signer> {
    console.log("Creating collection NFT...");
    const collectionNft = generateSigner(umi);

    const builder = await createNft(umi, {
        mint: collectionNft,
        name: collectionMetadata.name,
        symbol: collectionMetadata.symbol,
        uri: collectionMetadata.uri,
        sellerFeeBasisPoints: percentAmount(
            collectionMetadata.sellerFeeBasisPoints / 100,
            2
        ),
        isCollection: true,
    });
    await builder.sendAndConfirm(umi);
    console.log("Collection NFT created with address:", collectionNft.publicKey);

    return collectionNft;
}

function getSolanaExplorerUrl(
    signature: Uint8Array,
    cluster: string = "mainnet"
): string {
    const base58Signature = bs58.encode(signature);
    return `https://explorer.solana.com/tx/${base58Signature}?cluster=${cluster}`;
}

async function mintCNFT(
    umi: Umi,
    merkleTree: Signer,
    collectionNft: Signer,
    leafOwner: string
): Promise<string> {
    console.log("Minting cNFT...");
    const metadata = cNFTMetadata(publicKey(leafOwner));



    const builder = await mintToCollectionV1(umi, {
        leafOwner: publicKey(leafOwner),
        merkleTree: merkleTree.publicKey,
        collectionMint: collectionNft.publicKey,
        metadata: {
            name: metadata.name,
            uri: metadata.uri,
            sellerFeeBasisPoints: 500,
            collection: some({ key: collectionNft.publicKey, verified: true }),
            creators: [
                {
                    address: umi.identity.publicKey,
                    verified: true,
                    share: 100,
                },
            ],
        },
    });

    const result = await builder.sendAndConfirm(umi);
    console.log(
        "Check minting transaction on Solana Explorer:",
        getSolanaExplorerUrl(result.signature)
    );

    const leaf = await parseLeafFromMintToCollectionV1Transaction(
        umi,
        result.signature
    );

    console.log("Leaf:", leaf.id);
    return leaf.id;
}

// for new cNFT
// const merkleTree = await createMerkleTree();
// let nftCollection = await createCollectionNFT(umi);

// for existing cNFT
let merkleTree: Signer = { publicKey: "" } as Signer;
let nftCollection: Signer = { publicKey: "" } as Signer;

let recipient = "";

// mintCNFT(umi, merkleTree, nftCollection, recipient);

async function mintMultipleCNFTs(
    umi: Umi, merkleTree: Signer,
    collectionNft: Signer,
    recipients: string[]
) {
    let count = 0;
    for (let recipient of recipients) {
        console.log(`Minting cNFT for ${recipient}...`);
        console.log(`Minting cNFT ${count + 1} of ${recipients.length}`);
        await mintCNFT(umi, merkleTree, collectionNft, recipient);
        count++;
    }
}

async function readAddressesFromFile(filePath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const addresses: string[] = [];

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity,
        });

        rl.on('line', (line) => {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 0) {
                addresses.push(trimmedLine);
            }
        });

        rl.on('close', () => {
            resolve(addresses);
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

let recipients = await readAddressesFromFile(path.resolve('addresses.txt'));

mintMultipleCNFTs(umi, merkleTree, nftCollection, recipients);