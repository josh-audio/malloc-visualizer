import { observer } from "mobx-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import state from "../state/state";
import { Fragment, useEffect } from "react";

function insertNewlines(text: string) {
  return text
    .replace(/ /g, " ")
    .split("\n")
    .map((item) => {
      return [item, <br />];
    })
    .map((item, index) => {
      return (
        <Fragment key={index}>
          {item[0]}
          {item[1]}
        </Fragment>
      );
    });
}

function HistoryItem(props: {
  historyItem: { style: string; text: string };
  index: number;
}) {
  return (
    <div className={`command-history-item ${props.historyItem.style}`}>
      {props.historyItem.style !== "command" ? (
        insertNewlines(props.historyItem.text)
      ) : (
        <div className="code-render">
          <SyntaxHighlighter language="c" style={atomDark}>
            {props.historyItem.text}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
}

const CommandHistory = observer(() => {
  useEffect(() => {
    const scrollArea = document.querySelector(".command-history-container")!;
    scrollArea.scrollTop = scrollArea.scrollHeight;
  });

  return (
    <div className="command-history-container">
      {state.commandHistory.map((historyItem, index) => (
        <HistoryItem key={index} historyItem={historyItem} index={index} />
      ))}
    </div>
  );
});

export default CommandHistory;
