import { KushkiError } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { TokenResponse } from "gateway/MastercardTokenGateway";
import { CONTAINER } from "infrastructure/Container";
import { ITokenGateway } from "repository/ITokenGateway";
import { RequestCallback, UriOptions, UrlOptions } from "request";
import * as rp from "request-promise";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";

use(sinonChai);
describe("MastercardTokenGateway", () => {
  let sandbox: SinonSandbox;
  let gateway: ITokenGateway;
  let next: SinonSpy;

  beforeEach(() => {
    CONTAINER.snapshot();
    sandbox = createSandbox();
    next = sandbox.spy();
    process.env.MC_CERT_NAME = "mc_test";
  });
  afterEach(() => {
    sandbox.restore();
    CONTAINER.restore();
  });
  it("should get card data from token, success", (done: Mocha.Done) => {
    sandbox.stub(rp, "get").returns(
      Mock.from<rp.RequestPromise>(
        Promise.resolve(
          Mock.of<TokenResponse>({
            sourceOfFunds: {
              provided: {
                card: {
                  expiry: "0230",
                  number: "5555555555554444",
                },
              },
            },
          })
        )
      )
    );
    gateway = CONTAINER.get(IDENTIFIERS.TokenGateway);
    gateway.untokenize("5555551417534444").subscribe({
      next,
      complete: (): void => {
        expect(next).to.be.calledWith(
          match
            .has("number", "5555555555554444")
            .and(match.has("expiryMonth", "02"))
            .and(match.has("expiryYear", "30"))
            .and(match.has("name", "na"))
        );
        done();
      },
    });
  });
  it("should throw an error, fail", (done: Mocha.Done) => {
    sandbox.stub(rp, "get").returns(
      Mock.from<rp.RequestPromise>(
        Promise.reject({
          error: {},
        })
      )
    );
    gateway = CONTAINER.get(IDENTIFIERS.TokenGateway);
    gateway.untokenize("qwerty").subscribe({
      error: (err: Error | KushkiError): void => {
        expect(err).to.be.instanceOf(KushkiError);
        expect(err.name).to.be.eq("KSH010");
        done();
      },
      next: done,
    });
  });
  it("When untokenize is called but password is none, it requests without password", (done: Mocha.Done) => {
    process.env.MC_PASSWORD = "none";

    const request_spy: SinonStub<[
      UriOptions | UrlOptions,
      RequestCallback?
    ]> = sandbox.stub(rp, "get").returns(
      Mock.from<rp.RequestPromise>(
        Promise.resolve(
          Mock.of<TokenResponse>({
            sourceOfFunds: {
              provided: {
                card: {
                  expiry: "0230",
                  number: "5555555555554444",
                },
              },
            },
          })
        )
      )
    );

    gateway = CONTAINER.get(IDENTIFIERS.TokenGateway);
    gateway.untokenize("5555551417534444").subscribe({
      complete: (): void => {
        expect(request_spy).to.be.called;
        expect(request_spy.args[0][0]).to.haveOwnProperty(
          "passphrase",
          undefined
        );
        done();
      },
    });
  });
});
