/**
 * BinListGateway Unit Tests
 */

import { IDENTIFIERS as CORE, ILogger } from "@kushki/core";
import { expect, use } from "chai";
import { IDENTIFIERS } from "constant/Identifiers";
import { BinListGateway } from "gateway/BinListGateway";
import { CONTAINER } from "infrastructure/Container";
import * as proxyquire from "proxyquire";
import { IBinInfoGateway } from "repository/IBinInfoGateway";
import { createSandbox, match, SinonSandbox, SinonSpy, SinonStub } from "sinon";
import * as sinonChai from "sinon-chai";
import { Mock } from "ts-mockery";

use(sinonChai);
const BIN_LIST_GATEWAY_PATH: string = "gateway/BinListGateway";

describe("BinListGateway - ", () => {
  let box: SinonSandbox;
  let gateway: IBinInfoGateway;

  beforeEach(() => {
    box = createSandbox();
    CONTAINER.snapshot();
    CONTAINER.unbind(IDENTIFIERS.BinInfoGateway);
  });

  afterEach(() => {
    box.restore();
    CONTAINER.restore();
  });

  it("should consume BinList API service, success", (done: Mocha.Done) => {
    const get_bin_info_spy: SinonSpy = box.spy();

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).to(
      proxyquire<{ BinListGateway: new () => BinListGateway }>(
        BIN_LIST_GATEWAY_PATH,
        {
          binlookup: box
            .stub()
            .returns(box.stub().returns(Promise.resolve({ scheme: "asd" }))),
        }
      ).BinListGateway
    );

    gateway = CONTAINER.get(IDENTIFIERS.BinInfoGateway);
    gateway.getBinInfo("123456").subscribe({
      complete: (): void => {
        expect(get_bin_info_spy).to.be.calledOnce.and.calledWith(
          match.has("scheme")
        );
        done();
      },
      error: done,
      next: get_bin_info_spy,
    });
  });
  it("should consume BinList API service, bin not found", (done: Mocha.Done) => {
    const get_bin_info_spy: SinonSpy = box.spy();

    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).to(
      proxyquire<{ BinListGateway: new () => BinListGateway }>(
        BIN_LIST_GATEWAY_PATH,
        {
          binlookup: box
            .stub()
            .returns(box.stub().returns(Promise.reject({ code: 404 }))),
        }
      ).BinListGateway
    );
    gateway = CONTAINER.get(IDENTIFIERS.BinInfoGateway);
    gateway.getBinInfo("999999").subscribe({
      complete: (): void => {
        expect(get_bin_info_spy).to.be.calledOnce.and.calledWith(undefined);
        done();
      },
      error: done,
      next: get_bin_info_spy,
    });
  });
  it("should consume BinList API service, error", (done: Mocha.Done) => {
    const get_bin_info_spy: SinonSpy = box.spy();
    const logger_stub: SinonStub = box.stub();

    CONTAINER.rebind<ILogger>(CORE.Logger).toConstantValue(
      Mock.of<ILogger>({
        error: logger_stub,
      })
    );
    CONTAINER.bind(IDENTIFIERS.BinInfoGateway).to(
      proxyquire<{ BinListGateway: new () => BinListGateway }>(
        BIN_LIST_GATEWAY_PATH,
        {
          binlookup: box
            .stub()
            .returns(box.stub().returns(Promise.reject({ code: 500 }))),
        }
      ).BinListGateway
    );
    gateway = CONTAINER.get(IDENTIFIERS.BinInfoGateway);
    gateway.getBinInfo("999999").subscribe({
      complete: (): void => {
        expect(get_bin_info_spy).to.be.calledOnce.and.calledWith(undefined);
        expect(logger_stub).to.be.calledOnce;
        done();
      },
      error: done,
      next: get_bin_info_spy,
    });
  });
});
