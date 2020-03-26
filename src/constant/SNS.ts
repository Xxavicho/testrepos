/**
 * Constant with name of SNS used on the service.
 */
const SNS: {
  SnsTransaction: string;
} = {
  SnsTransaction: `${process.env.SNS_INVOICE}`,
};

export { SNS };
