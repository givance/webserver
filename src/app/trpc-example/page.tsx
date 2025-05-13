"use client";

import { useState } from "react";
import { useExample } from "../hooks/use-example";

/**
 * Example page demonstrating tRPC usage
 */
export default function TRPCExamplePage() {
  const { hello, isHelloLoading, serverTime, isServerTimeLoading, a, b, setA, setB, handleAdd, isAddingLoading } =
    useExample();

  const [result, setResult] = useState<number | null>(null);

  /**
   * Handle form submission for addition
   */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sum = await handleAdd();
    setResult(sum);
  };

  return (
    <>
      <title>tRPC Example</title>
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">tRPC Example</h1>

        <div className="grid gap-8">
          {/* Hello Query Section */}
          <section className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Hello Query</h2>
            {isHelloLoading ? <p>Loading greeting...</p> : <p className="text-lg">{hello}</p>}
          </section>

          {/* Server Time Section */}
          <section className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Server Time</h2>
            {isServerTimeLoading ? (
              <p>Loading server time...</p>
            ) : (
              <div>
                <p className="text-lg">Current Server Time: {serverTime}</p>
              </div>
            )}
          </section>

          {/* Add Mutation Section */}
          <section className="bg-gray-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Addition Mutation</h2>
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="a" className="block mb-1">
                    First Number (A)
                  </label>
                  <input
                    id="a"
                    type="number"
                    value={a}
                    onChange={(e) => setA(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label htmlFor="b" className="block mb-1">
                    Second Number (B)
                  </label>
                  <input
                    id="b"
                    type="number"
                    value={b}
                    onChange={(e) => setB(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isAddingLoading}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-blue-300"
              >
                {isAddingLoading ? "Calculating..." : "Add Numbers"}
              </button>
              {result !== null && (
                <div className="mt-4">
                  <p className="text-lg font-medium">
                    Result: {a} + {b} = {result}
                  </p>
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
