/**
 *    Dynamo Gateway
 */
import { AWSError } from "aws-sdk";
import {
  DocumentClient,
  PutItemInput,
  PutItemInputAttributeMap,
} from "aws-sdk/clients/dynamodb";
import { IDENTIFIERS } from "constant/Identifiers";
import { IndexEnum } from "infrastructure/IndexEnum";
import { inject, injectable } from "inversify";
import { defaultTo } from "lodash";
import "reflect-metadata";
import { IDynamoGateway } from "repository/IDynamoGateway";
import { Observable, of, throwError } from "rxjs";
import { tag } from "rxjs-spy/operators";
import { catchError, map, mapTo, mergeMap, switchMap } from "rxjs/operators";
/**
 * DynamoGateway to send data do DynamoDB
 */
@injectable()
export class DynamoGateway implements IDynamoGateway {
  private readonly _client: DocumentClient;

  constructor(@inject(IDENTIFIERS.AwsDocumentClient) client: DocumentClient) {
    this._client = client;
  }

  public put(
    data: object,
    table: string,
    condition?: string
  ): Observable<boolean> {
    const params: PutItemInput = {
      Item: <PutItemInputAttributeMap>data,
      TableName: table,
    };

    if (condition !== undefined) params.ConditionExpression = condition;

    return of(1).pipe(
      switchMap(async () => this._client.put(params).promise()),
      catchError((err: AWSError) => {
        if (
          condition !== undefined &&
          err.code === "ConditionalCheckFailedException"
        )
          return of(true);

        return throwError(err);
      }),
      tag("DynamoGateway | put"),
      map(() => true)
    );
  }
  public query<T>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string
  ): Observable<T[]> {
    return of(1).pipe(
      switchMap(async () => {
        const params: DocumentClient.QueryInput = {
          ExpressionAttributeValues: {
            ":d": value,
          },
          IndexName: index,
          KeyConditionExpression: `${field} = :d`,
          TableName: table,
        };

        return this._client.query(params).promise();
      }),
      map((output: DocumentClient.QueryOutput) =>
        defaultTo(<T[]>output.Items, [])
      ),
      tag("DynamoGateway | query")
    );
  }

  public getItem<T extends object>(
    table: string,
    key: object
  ): Observable<T | undefined> {
    return of(1).pipe(
      switchMap(async () => {
        const params: DocumentClient.GetItemInput = {
          ConsistentRead: true,
          Key: key,
          TableName: table,
        };

        return this._client.get(params).promise();
      }),
      map((output: DocumentClient.GetItemOutput) => <T>output.Item),
      tag("DynamoGateway | getItem")
    );
  }

  public updateValues(
    tableName: string,
    key: DocumentClient.Key,
    values: object
  ): Observable<boolean> {
    return of(1).pipe(
      map(() => {
        const attribute_names: DocumentClient.ExpressionAttributeNameMap = {};
        const attribute_values: DocumentClient.ExpressionAttributeValueMap = {};
        let update_expression: string = "SET";

        Object.keys(values).forEach((valueKey: string) => {
          attribute_names[`#${valueKey}`] = valueKey;
          attribute_values[`:${valueKey}`] = values[`${valueKey}`];
          update_expression += ` #${valueKey}=:${valueKey},`;
        });

        update_expression = update_expression.substring(
          0,
          update_expression.length - 1
        );

        return {
          ExpressionAttributeNames: attribute_names,
          ExpressionAttributeValues: attribute_values,
          Key: key,
          TableName: tableName,
          UpdateExpression: update_expression,
        };
      }),
      mergeMap(async (params: DocumentClient.UpdateItemInput) =>
        this._client.update(params).promise()
      ),
      mapTo(true),
      tag("DynamoClient | update")
    );
  }
}
