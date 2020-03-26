// Helpers scripts for serverless.yml

module.exports.logRetentionInDays = () => {
  return {
    ci: 7,
    qa: 7,
    uat: 7,
    stg: 7,
    primary: 3653,
  };
};

module.exports.canaryDeploymentType = () => {
  return {
    ci: "AllAtOnce",
    qa: "AllAtOnce",
    uat: "AllAtOnce",
    stg: "AllAtOnce",
    primary: "Linear10PercentEvery2Minutes",
  };
};

module.exports.awsAccountId = () => {
  return {
    ci: "412465614222",
    qa: "412465614222",
    uat: "412465614222",
    stg: "412465614222",
    primary: "073501845287",
  };
};

module.exports.s3Transaction = () => {
  return {
    ci: "etl-transactional-dev",
    qa: "etl-transactional-dev",
    uat: "etl-transactional-dev",
    stg: "etl-transactional-dev",
    primary: "etl-transactional",
  };
};
