import state from "../../state/state";
import {
  DeclarationNode,
  LiteralNode,
  StatementNode,
  TypeNode,
} from "../grammar_output_validator";
import { coerce, coerceLiteralToChar, coerceLiteralToInt } from "./coerce";
import { initMemory, mallocImpl } from "./malloc_impl";
import {
  coerceOperatorDivide,
  coerceOperatorMinus,
  coerceOperatorMultiply,
  coerceOperatorPlus,
} from "./operators";

type VoidNode = {
  nodeType: "void";
};

// Defines a function that is implemented in native JavaScript.
type NativeFunctionDefinitionNode = {
  nodeType: "nativeFunctionDefinition";

  // Union with type node here is a hack. If we want types to be passed into
  // functions, we really should allow types as values in the grammar, and then
  // have the runtime engine handle them. For now we just allow types as values
  // in function calls from the grammar side, and nowhere else except casts and
  // declarations.
  arguments: (DeclarationNode | TypeNode)[];
  body: (args: (RuntimeValueNode | TypeNode)[]) => RuntimeValueNode | VoidNode;
};

type RuntimeValueNode = {
  nodeType: "runtimeValue";
  type: TypeNode;
  value: LiteralNode | NativeFunctionDefinitionNode;
};

type Scope = Record<string, RuntimeValueNode>;

class Engine {
  globalScope: Scope = {
    malloc: {
      nodeType: "runtimeValue",
      type: {
        nodeType: "type",
        type: "nativeFunction",
      },
      value: {
        nodeType: "nativeFunctionDefinition",
        arguments: [
          {
            nodeType: "declaration",
            declaration: {
              nodeType: "singleDeclaration",
              identifier: {
                nodeType: "identifier",
                identifier: "size",
              },
              type: {
                nodeType: "type",
                type: "int",
              },
            },
          },
        ],
        body: (args: (RuntimeValueNode | TypeNode)[]) => {
          if (args.some((arg) => arg.nodeType === "type")) {
            throw new Error(`Runtime error: Cannot call malloc with a type`);
          }

          return mallocImpl(
            engine.globalScope,
            args.filter((arg) => arg.nodeType === "runtimeValue")
          );
        },
      },
    },

    clear: {
      nodeType: "runtimeValue",
      type: {
        nodeType: "type",
        type: "nativeFunction",
      },
      value: {
        nodeType: "nativeFunctionDefinition",
        arguments: [],
        body: () => {
          state.commandHistory = [];
          return { nodeType: "void" };
        },
      },
    },

    setDisplayBase: {
      nodeType: "runtimeValue",
      type: {
        nodeType: "type",
        type: "nativeFunction",
      },
      value: {
        nodeType: "nativeFunctionDefinition",
        arguments: [
          {
            nodeType: "declaration",
            declaration: {
              nodeType: "singleDeclaration",
              identifier: {
                nodeType: "identifier",
                identifier: "base",
              },
              type: {
                nodeType: "type",
                type: "int",
              },
            },
          },
        ],
        body: (args: (RuntimeValueNode | TypeNode)[]) => {
          if (args[0].nodeType === "type") {
            throw new Error(
              `Runtime error: Cannot call setDisplayBase with a type`
            );
          }

          if (args[0].value.nodeType !== "literal") {
            throw new Error(
              `Runtime error: Expected argument 0 to be of type int, but got ${args[0].value.nodeType}.`
            );
          }

          if (args[0].value.literal.nodeType !== "int") {
            throw new Error(
              `Internal error: Expected argument 0 to be of type int, but got ${args[0].value.literal.nodeType}.`
            );
          }

          const base = args[0].value.literal.int;

          if (base !== 10 && base !== 16) {
            throw new Error(
              `Runtime error: Invalid base ${base}. Must be 10 or 16.`
            );
          }

          state.displayBase = base;

          return { nodeType: "void" };
        },
      },
    },

    sizeof: {
      nodeType: "runtimeValue",
      type: {
        nodeType: "type",
        type: "nativeFunction",
      },
      value: {
        nodeType: "nativeFunctionDefinition",
        arguments: [
          {
            nodeType: "type",
            type: "void*", // Again, a hack. This doesn't actually matter, just a placeholder.
          },
        ],
        body: (args: (RuntimeValueNode | TypeNode)[]) => {
          if (args.length !== 1) {
            throw new Error(
              `Runtime error: Expected 1 argument for sizeof, but got ${args.length}.`
            );
          }

          if (args[0].nodeType !== "type") {
            throw new Error(
              `Internal error: Expected argument 0 to be of type "type", but got ${args[0].nodeType}.`
            );
          }

          if (args[0].type === "void") {
            throw new Error(
              `Runtime error: Cannot call sizeof on type "void".`
            );
          }

          if (args[0].type === "string") {
            throw new Error(
              `Runtime error: Cannot call sizeof on type "string".`
            );
          }

          let size = 1;

          if (args[0].type === "int") {
            size = 4;
          }

          return {
            nodeType: "runtimeValue",
            type: { nodeType: "type", type: "int" },
            value: {
              nodeType: "literal",
              literal: {
                nodeType: "int",
                int: size,
              },
            },
          };
        },
      },
    },

    reset: {
      nodeType: "runtimeValue",
      type: {
        nodeType: "type",
        type: "nativeFunction",
      },
      value: {
        nodeType: "nativeFunctionDefinition",
        arguments: [],
        body: () => {
          initMemory();
          return { nodeType: "void" };
        },
      }
    }
  };

  // Recursively evaluates the given statement. Returns a literal node if the
  // statement evaluates to a value, otherwise returns a void node.
  evaluate(statement: StatementNode): RuntimeValueNode | VoidNode {
    if (statement.nodeType === "literal") {
      const type: TypeNode = {
        nodeType: "type",
        type: statement.literal.nodeType,
      };

      return {
        nodeType: "runtimeValue",
        type: type,
        value: statement,
      };
    } else if (statement.nodeType === "operator") {
      const left = this.evaluate(statement.left);
      const right = this.evaluate(statement.right);

      if (left.nodeType === "void") {
        throw new Error(
          `Runtime error: Left-hand side of operator ${statement.operator} is void.`
        );
      } else if (right.nodeType === "void") {
        throw new Error(
          `Runtime error: Right-hand side of operator ${statement.operator} is void.`
        );
      }

      if (left.value.nodeType !== "literal") {
        throw new Error(
          `Runtime error: Expected left value to be of type "literal", but got ${left.value.nodeType}.`
        );
      } else if (right.value.nodeType !== "literal") {
        throw new Error(
          `Runtime error: Expected right value to be of type "literal", but got ${right.value.nodeType}.`
        );
      }

      let literal: LiteralNode;

      if (statement.operator === "+") {
        literal = coerceOperatorPlus(left.value, right.value);
      } else if (statement.operator === "-") {
        literal = coerceOperatorMinus(left.value, right.value);
      } else if (statement.operator === "*") {
        literal = coerceOperatorMultiply(left.value, right.value);
      } else if (statement.operator === "/") {
        literal = coerceOperatorDivide(left.value, right.value);
      } else {
        throw Error(
          `Internal error: Unexpected operator ${statement.operator}.`
        );
      }

      return {
        nodeType: "runtimeValue",
        type: { nodeType: "type", type: literal.literal.nodeType },
        value: literal,
      };
    } else if (statement.nodeType === "cast") {
      const result = this.evaluate(statement.statement);

      if (result.nodeType === "void") {
        throw new Error(
          `Runtime error: Type "void" cannot be cast to ${statement.type.type}.`
        );
      }

      return coerce(result, statement.type);
    } else if (statement.nodeType == "parenthesis") {
      return this.evaluate(statement.statement);
    } else if (statement.nodeType === "declaration") {
      const type = statement.declaration.type.type;

      if (type === "void") {
        throw new Error('Type error: Cannot declare variable of type "void".');
      }

      if (statement.declaration.type.type === "string") {
        this.globalScope[statement.declaration.identifier.identifier] = {
          nodeType: "runtimeValue",
          type: statement.declaration.type,
          value: {
            nodeType: "literal",
            literal: {
              nodeType: "string",
              string: "",
            },
          },
        };
      } else {
        this.globalScope[statement.declaration.identifier.identifier] = coerce(
          {
            nodeType: "runtimeValue",
            type: statement.declaration.type,
            value: {
              nodeType: "literal",
              literal: {
                nodeType: "int",
                int: 0,
              },
            },
          },
          statement.declaration.type
        );
      }

      return { nodeType: "void" };
    } else if (statement.nodeType === "identifier") {
      const value = this.globalScope[statement.identifier];

      if (value === undefined) {
        throw new Error(
          `Runtime error: Identifier ${statement.identifier} is not defined.`
        );
      }

      return value;
    } else if (statement.nodeType === "assignment") {
      let address: number | undefined;

      if (statement.left.nodeType === "declaration") {
        // If the left side is a declaration, evaluate it first
        this.evaluate(statement.left);
      } else if (statement.left.nodeType === "dereference") {
        const runtimeValue = this.evaluate(statement.left.statement);

        if (runtimeValue.nodeType === "void") {
          throw new Error(`Runtime error: Cannot dereference void value.`);
        }

        // If the left side is a dereference, store the memory address for later
        address = this.getDereferenceAddress(runtimeValue);

        if (address < 0 || address >= state.heap.length) {
          throw new Error(
            `Runtime error: Address ${address} is outside of the addressable memory range.`
          );
        }
      }

      // Evaluate the right-hand side of the assignment
      const value = this.evaluate(statement.right);

      if (value.nodeType === "void") {
        throw new Error(`Runtime error: Cannot assign void to variable.`);
      }

      let scopeItem: RuntimeValueNode;

      if (address !== undefined) {
        const coerced = coerce(value, { nodeType: "type", type: "int" });
        if (coerced.value.nodeType !== "literal") {
          throw new Error(
            `Internal error: Expected coerced value to be of type "literal", but got ${coerced.value.nodeType}.`
          );
        } else if (coerced.value.literal.nodeType !== "int") {
          throw new Error(
            `Internal error: Expected coerced value to be of type "int", but got ${coerced.type.type}.`
          );
        }

        const heapValueRaw = coerced.value.literal.int;

        if (heapValueRaw < 0) {
          const value = Math.abs(heapValueRaw) % 256;
          state.heap[address] = 256 - value;
        } else {
          state.heap[address] = heapValueRaw % 256;
        }

        return coerced;
      }
      // Set the value in the global scope
      else if (statement.left.nodeType === "identifier") {
        scopeItem = coerce(
          value,
          this.globalScope[statement.left.identifier].type
        );
        this.globalScope[statement.left.identifier] = scopeItem;
      } else if (statement.left.nodeType === "declaration") {
        scopeItem = coerce(value, statement.left.declaration.type);
        this.globalScope[statement.left.declaration.identifier.identifier] =
          scopeItem;
      } else {
        throw new Error(
          `Internal error: Unexpected assignment left-hand side node type.`
        );
      }

      return scopeItem;
    } else if (statement.nodeType === "functionCall") {
      const funcRuntimeValue = this.evaluate(statement.functionName);

      if (funcRuntimeValue.nodeType === "void") {
        throw new Error(
          `Type error: Identifier ${statement.functionName.identifier} is not a function.`
        );
      }

      const func = funcRuntimeValue.value;

      if (func.nodeType === "nativeFunctionDefinition") {
        const args = statement.arguments
          .map((arg) => (arg.nodeType === "type" ? arg : this.evaluate(arg)))
          .filter(
            (arg) => arg.nodeType === "runtimeValue" || arg.nodeType === "type"
          );

        // Validate argument count
        if (args.length !== func.arguments.length) {
          throw new Error(
            `Type error: Expected ${func.arguments.length} argument${
              func.arguments.length === 1 ? "" : "s"
            } for function ${statement.functionName.identifier}, but got ${
              args.length
            }.`
          );
        }

        // Validate argument types
        for (let i = 0; i < args.length; i++) {
          const funcArg = func.arguments[i];
          const inputArg = args[i];
          if (funcArg.nodeType === "type" && inputArg.nodeType === "type") {
            continue;
          }

          if (
            funcArg.nodeType === "type" &&
            inputArg.nodeType === "runtimeValue"
          ) {
            throw new Error(
              `Type error: Expected argument ${i} to be of type ${funcArg.type}, but got a runtime value.`
            );
          }

          if (
            funcArg.nodeType === "declaration" &&
            inputArg.nodeType === "type"
          ) {
            throw new Error(
              `Type error: Expected argument ${i} to be a runtime value, but got a type.`
            );
          }

          if (
            funcArg.nodeType !== "declaration" ||
            inputArg.nodeType !== "runtimeValue"
          ) {
            throw new Error(
              `Internal error: Unexpected argument node type for function ${statement.functionName.identifier}.`
            );
          }

          if (inputArg.type.type !== funcArg.declaration.type.type) {
            throw new Error(
              `Type error: ${statement.functionName.identifier}: Expected argument ${i} to be of type ${funcArg.declaration.type.type}, but got ${inputArg.type.type}.`
            );
          }
        }

        return func.body(args);
      } else {
        throw new Error(
          `Type error: Identifier ${statement.functionName.identifier} is not a function.`
        );
      }
    } else if (statement.nodeType === "dereference") {
      const runtimeValue = this.evaluate(statement.statement);

      if (runtimeValue.nodeType === "void") {
        throw new Error(`Runtime error: Cannot dereference void value.`);
      }

      const address = this.getDereferenceAddress(runtimeValue);

      if (address < 0 || address >= state.heap.length) {
        throw new Error(
          `Runtime error: Address ${address} is outside of the addressable memory range.`
        );
      }

      const value: LiteralNode = {
        nodeType: "literal",
        literal: { nodeType: "int", int: state.heap[address] },
      };

      if (runtimeValue.type.type === "int*") {
        return {
          nodeType: "runtimeValue",
          type: { nodeType: "type", type: "int" },
          value: value,
        };
      } else if (runtimeValue.type.type === "char*") {
        return {
          nodeType: "runtimeValue",
          type: { nodeType: "type", type: "char" },
          value: coerceLiteralToChar(value),
        };
      } else {
        throw new Error(
          `Internal error: Unexpected pointer type ${runtimeValue.type.type}.`
        );
      }
    }

    throw Error("Internal error: Unexpected statement node type.");
  }

  private getDereferenceAddress(value: RuntimeValueNode): number {
    if (value.type.type === "nativeFunction") {
      throw new Error(`Type error: Cannot dereference native function.`);
    }

    if (value.type.type[value.type.type.length - 1] !== "*") {
      throw new Error(
        `Type error: Cannot dereference non-pointer type ${value.type.type}.`
      );
    }

    if (value.value.nodeType !== "literal") {
      throw new Error(
        `Internal error: Expected variable value to be of type "literal", but got ${value.value.nodeType}.`
      );
    }

    const coercedValue = coerceLiteralToInt(value.value).literal;
    if (coercedValue.nodeType !== "int") {
      throw new Error(
        `Internal error: Expected coerced value to be of type "int", but got ${coercedValue.nodeType}.`
      );
    }

    const address = coercedValue.int;

    return address;
  }
}

const engine = new Engine();

export default engine;
export type { Scope, RuntimeValueNode };
