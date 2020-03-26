/**
 * Dynamo gateway interface file.
 */
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { IndexEnum } from "infrastructure/IndexEnum";
import { Observable } from "rxjs";

/**
 * Gateway logic to connect to Dynamo.
 */
export interface IDynamoGateway {
  /**
   * Put an item in dynamo_put table
   * @param data - to save in table
   * @param table - name of the dynamo_put table
   * @param condition - condition expression on the put
   */
  put(data: object, table: string, condition?: string): Observable<boolean>;
  /**
   * Query on table using an index
   * @param table - name of the dynamo_put table
   * @param index - index's name on the table
   * @param field - index's field to filter the data
   * @param value - value to search on the index
   */
  query<T = object>(
    table: string,
    index: IndexEnum,
    field: string,
    value: string
  ): Observable<T[]>;
  /**
   * Get a table item from dynamo
   * @param table - table name
   * @param key - object with the key filter
   */
  getItem<T extends object>(
    table: string,
    key: object
  ): Observable<T | undefined>;

  /**
   * Generic method to update any value
   * @param tableName - name of Dynamo table
   * @param key - primary hash of table
   * @param values - object with values to update
   */
  updateValues(
    tableName: string,
    key: DocumentClient.Key,
    values: object
  ): Observable<boolean>;
}
