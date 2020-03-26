/**
 * DynamoDB's Index enum
 */
export enum IndexEnum {
  transaction_transaction_id = "transactions-transaction_id",
  transaction_sale_ticket_number = "transactions-sale_ticket_number",
  transaction_ticket_number = "transactions-ticket_number",
  merchant_private_id = "merchants-private_id-index",
  private_merchant_id_processor = "privateMerchantId",
  processors_merchant_id_index = "processors-merchant_id-index",
}
