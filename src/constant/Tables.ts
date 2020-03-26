/**
 * Tables identifiers
 */

export type TableList = {
  bins: string;
  charges: string;
  merchants: string;
  processors: string;
  tokens: string;
  transaction: string;
};

const TABLES: TableList = {
  bins: `${process.env.DYNAMO_BIN}`,
  charges: `${process.env.DYNAMO_CHARGES}`,
  merchants: `${process.env.DYNAMO_MERCHANT}`,
  processors: `${process.env.DYNAMO_PROCESSOR}`,
  tokens: `${process.env.DYNAMO_TOKEN}`,
  transaction: `${process.env.DYNAMO_TRANSACTION}`,
};

export { TABLES };
