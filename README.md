# Automaton Automator

This Visual Studio Code extension allows working with `.auto` files to visualize automata using Graphviz.

## Features

- Real-time preview of DOT/Graphviz diagrams
- Special focus on automata
- Command to copy as PNG
- Syntax highlighting for `.auto` and `.dot` files

## Requirements

- Visual Studio Code 1.60.0 or higher
- Graphviz installed on the system (the `dot` command available in the PATH)

## Usage

1. Install the extension
2. Create or open a file with the `.auto` extension
3. The extension will automatically display a preview of the diagram
4. Use the context menu or command palette for "Copy as PNG"

## Example of a .auto file

```dot
digraph pda {
  rankdir=LR;
  size="8,5"
  
  node [shape = point]; qi
  node [shape = circle]; q1 q2 q3
  node [shape = doublecircle]; q4

  qi -> q1

  q1 -> q2 [label="1,\\epsilon\\to\\empty"]
  q2 -> q1 [label="\\epsilon,\\epsilon\\toB"]
  q1 -> q3 [label="\\epsilon,\\empty\\to$"]
  q2 -> q4 [label="0,A\\to\\epsilon"]
  q3 -> q4 [label="\\epsilon,B\\toA"]
  q4 -> q1 [label="0,$\\to\\epsilon"]
}
```