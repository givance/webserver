/**
 * Transformer utility for tRPC
 * This is used to transform data between client and server
 */
export const transformer = {
  /**
   * Serializes data to be sent over the network
   * @param obj Object to serialize
   */
  serialize: (obj: unknown) => {
    return JSON.stringify(obj);
  },
  /**
   * Deserializes data received from the network
   * @param text String to deserialize
   */
  deserialize: (text: string) => {
    return JSON.parse(text);
  },
};
