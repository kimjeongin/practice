# Data Structures and Algorithms

## Overview

Data structures are ways of organizing and storing data so that they can be accessed and worked with efficiently. The choice of data structure affects the performance of algorithms.

## Linear Data Structures

### Arrays
- **Definition**: Collection of elements stored in contiguous memory locations
- **Access Time**: O(1)
- **Search Time**: O(n) for unsorted, O(log n) for sorted
- **Use Cases**: When you need fast random access to elements

### Linked Lists
- **Definition**: Linear collection of elements, each pointing to the next
- **Types**: 
  - Singly Linked List
  - Doubly Linked List
  - Circular Linked List
- **Access Time**: O(n)
- **Insertion/Deletion**: O(1) if position is known
- **Use Cases**: When frequent insertion/deletion is needed

### Stacks
- **Definition**: LIFO (Last In, First Out) structure
- **Operations**: push(), pop(), peek(), isEmpty()
- **Time Complexity**: O(1) for all operations
- **Use Cases**: Function calls, undo operations, expression evaluation

### Queues
- **Definition**: FIFO (First In, First Out) structure
- **Types**: Simple Queue, Circular Queue, Priority Queue, Deque
- **Operations**: enqueue(), dequeue(), front(), isEmpty()
- **Time Complexity**: O(1) for all operations
- **Use Cases**: BFS, task scheduling, print queues

## Non-Linear Data Structures

### Trees
- **Definition**: Hierarchical structure with nodes connected by edges
- **Types**:
  - Binary Tree
  - Binary Search Tree (BST)
  - AVL Tree
  - Red-Black Tree
  - B-Trees
- **Traversals**: Inorder, Preorder, Postorder, Level-order
- **Use Cases**: File systems, database indexing, expression parsing

### Graphs
- **Definition**: Collection of vertices connected by edges
- **Types**: Directed/Undirected, Weighted/Unweighted, Cyclic/Acyclic
- **Representations**: Adjacency Matrix, Adjacency List
- **Algorithms**: DFS, BFS, Dijkstra's, Bellman-Ford
- **Use Cases**: Social networks, routing, web crawling

### Hash Tables
- **Definition**: Data structure that maps keys to values using hash function
- **Average Time Complexity**: O(1) for search, insert, delete
- **Collision Handling**: Chaining, Open Addressing
- **Use Cases**: Dictionaries, caches, database indexing

## Algorithm Paradigms

### Greedy Algorithms
- Make locally optimal choices
- Examples: Huffman Coding, Dijkstra's Algorithm
- May not always give global optimum

### Dynamic Programming
- Break problems into overlapping subproblems
- Store solutions to avoid recomputation
- Examples: Fibonacci, Knapsack Problem, LCS

### Divide and Conquer
- Divide problem into smaller subproblems
- Solve recursively and combine results
- Examples: Merge Sort, Quick Sort, Binary Search

### Backtracking
- Try all possible solutions
- Abandon solutions that don't work
- Examples: N-Queens, Sudoku Solver, Maze Solving

## Sorting Algorithms

### Comparison-Based Sorts
- **Bubble Sort**: O(n²) - Simple but inefficient
- **Selection Sort**: O(n²) - Good for small datasets
- **Insertion Sort**: O(n²) - Good for nearly sorted data
- **Merge Sort**: O(n log n) - Stable, consistent performance
- **Quick Sort**: O(n log n) average - Fast in practice
- **Heap Sort**: O(n log n) - In-place, not stable

### Non-Comparison Sorts
- **Counting Sort**: O(n + k) - For small range of integers
- **Radix Sort**: O(d × n) - For fixed-length integers
- **Bucket Sort**: O(n + k) - For uniformly distributed data

## Time and Space Complexity

### Big O Notation
- **O(1)**: Constant time
- **O(log n)**: Logarithmic time
- **O(n)**: Linear time
- **O(n log n)**: Linearithmic time
- **O(n²)**: Quadratic time
- **O(2ⁿ)**: Exponential time

### Space Complexity
Consider both auxiliary space and input space when analyzing algorithms.

## Choosing the Right Data Structure

Consider these factors:
1. **Time complexity requirements**
2. **Space constraints**
3. **Type of operations needed**
4. **Data access patterns**
5. **Memory allocation preferences**

### Quick Reference
- Need fast random access? → Array
- Frequent insertions/deletions? → Linked List
- LIFO operations? → Stack
- FIFO operations? → Queue
- Hierarchical data? → Tree
- Complex relationships? → Graph
- Fast lookups? → Hash Table