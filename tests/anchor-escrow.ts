import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { AnchorEscrow } from '../target/types/anchor_escrow';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint,createAccount, mintTo, } from "@solana/spl-token";
import * as serumCmn from '@project-serum/common';
import { assert } from "chai";

describe('anchor-escrow', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorEscrow as Program<AnchorEscrow>;

  let mintA = null;
  let mintB = null;
  let initializerTokenAccountA = null;
  let initializerTokenAccountB = null;
  let takerTokenAccountA = null;
  let takerTokenAccountB = null;
  let vault_account_pda = null;
  let vault_account_bump = null;
  let vault_authority_pda = null;

  const takerAmount = 10;
  const initializerAmount = 1000;

  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const initializerMainAccount = anchor.web3.Keypair.generate();
  const takerMainAccount = anchor.web3.Keypair.generate();
  let escrowAccount = null;

  it("Initialize program state", async () => {
    // Airdropping tokens to a payer.
    
    escrowAccount = await serumCmn.createAccountRentExempt(
      provider,
      program.programId,
      program.account.escrowAccount.size
    );
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      2*1000000000
    );

    const latestBlockHash = await provider.connection.getLatestBlockhash();

    const tempSignature = await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    // console.log("CONFIRM", provider.wallet.publicKey);

    // Fund Main Accounts
    await provider.send(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: initializerMainAccount.publicKey,
            lamports: 100000000,
          }),
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: takerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    mintA = await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      9,
    );

    mintB = await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      9,
    );

    initializerTokenAccountA = await createAccount(provider.connection, payer, mintA, initializerMainAccount.publicKey);
    takerTokenAccountA = await createAccount(provider.connection, payer, mintA, takerMainAccount.publicKey);

    initializerTokenAccountB = await createAccount(provider.connection, payer, mintB, initializerMainAccount.publicKey);
    takerTokenAccountB = await createAccount(provider.connection, payer, mintB, takerMainAccount.publicKey);
    

    await mintTo(
      provider.connection,
      payer,
      mintA,
      initializerTokenAccountA,
      mintAuthority.publicKey,
      initializerAmount,
      [mintAuthority],
    );

    await mintTo(
      provider.connection,
      payer,
      mintB,
      takerTokenAccountB,
      mintAuthority.publicKey,
      initializerAmount,
      [mintAuthority],
    );

    let _initializerTokenAccountA = await provider.connection.getAccountInfo(initializerTokenAccountA);
    let _takerTokenAccountB = await provider.connection.getAccountInfo(takerTokenAccountB);

    // console.log("CCCCC", _initializerTokenAccountA.data.toString("utf8"));
    // var data = Buffer.isBuffer(_initializerTokenAccountA.data);
    // console.log("CCCCC", _initializerTokenAccountA.data.toJSON())
    // assert.ok(_initializerTokenAccountA.amount.toNumber() == initializerAmount);
    // assert.ok(_takerTokenAccountB.amount.toNumber() == takerAmount);
  });

  it("Initialize escrow", async () => {
    const [_vault_account_pda, _vault_account_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token-seed"))],
      program.programId
    );
    vault_account_pda = _vault_account_pda;
    vault_account_bump = _vault_account_bump;

    // console.log("PAD", vault_account_pda);
    // console.log("BUMP", vault_account_bump);

    await provider.connection.requestAirdrop(
      initializerMainAccount.publicKey,
      2*1000000000
    );

    const [_vault_authority_pda, _vault_authority_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
      program.programId
    );
    vault_authority_pda = vault_authority_pda;
    
    const tempVar = await program.account.escrowAccount.createInstruction(escrowAccount);

    // console.log("1", vault_account_bump);
    // console.log("2", initializerAmount);
    // console.log("3", takerAmount);
    // console.log("4", initializerMainAccount.publicKey);
    // console.log("5", mintA);
    // console.log("6", initializerTokenAccountA);
    // console.log("7", initializerTokenAccountB);
    // console.log("8", escrowAccount.publicKey);
    // console.log("9", anchor.web3.SystemProgram.programId);
    // console.log("10", anchor.web3.SYSVAR_RENT_PUBKEY);
    // console.log("11", TOKEN_PROGRAM_ID);
    // console.log("12", tempVar);
    // console.log("13", escrowAccount);
    
    await program.rpc.initialize(
      vault_account_bump,
      new anchor.BN(initializerAmount),
      new anchor.BN(takerAmount),
      {
        accounts: {
          initializer: initializerMainAccount.publicKey,
          vaultAccount: vault_account_pda,
          mint: mintA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          initializerReceiveTokenAccount: initializerTokenAccountB,
          escrowAccount: escrowAccount.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers:[ initializerMainAccount],
      }
    );

    // let _vault = await provider.connection.getAccountInfo(vault_account_pda);

    // let _escrowAccount = await program.account.escrowAccount.fetch(
    //   escrowAccount.publicKey
    // );

    // // Check that the new owner is the PDA.
    // assert.ok(_vault.owner.equals(vault_authority_pda));

    // // Check that the values in the escrow account match what we expect.
    // assert.ok(_escrowAccount.initializerKey.equals(initializerMainAccount.publicKey));
    // assert.ok(_escrowAccount.initializerAmount.toNumber() == initializerAmount);
    // assert.ok(_escrowAccount.takerAmount.toNumber() == takerAmount);
    // assert.ok(
    //   _escrowAccount.initializerDepositTokenAccount.equals(initializerTokenAccountA)
    // );
    // assert.ok(
    //   _escrowAccount.initializerReceiveTokenAccount.equals(initializerTokenAccountB)
    // );
  });

  it("Exchange escrow state", async () => {
    // TODO
  });

  it("Initialize escrow and cancel escrow", async () => {
    // TODO
  });
});


