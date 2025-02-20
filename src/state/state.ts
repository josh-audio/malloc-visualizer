import { makeAutoObservable } from "mobx";

type CommandHistoryItem = {
  style: "command" | "error" | "info";
  text: string;
};

function getDefaultCommandHistory(): CommandHistoryItem[] {
  return [
    {
      style: "info",
      text: "-> Type help() for usage.",
    },
  ];
}

class State {
  displayBase: 10 | 16 = 16;

  memorySize: number = 256;
  heap: number[] = [];

  // Styles:
  //  - command (for actual commands)
  //  - error (syntax or runtime errors)
  //  - info (non-error feedback)
  commandHistory: CommandHistoryItem[] = getDefaultCommandHistory();

  resetCommandHistory() {
    this.commandHistory = getDefaultCommandHistory();
  }

  constructor() {
    for (let i = 0; i < this.memorySize; i++) {
      this.heap.push(0);
    }

    makeAutoObservable(this);
  }
}

const state = new State();

export default state;
export type { CommandHistoryItem };
