/**
 * Transaction Types
 */
export enum TransactionRuleTypeEnum {
  CHARGE = "charge",
  PREAUTH = "preauthorization",
  CAPTURE = "capture",
  DEFERRED = "deferred",
  SUBSCRIPTION_VALIDATION = "subscriptionChargeValidation",
}
