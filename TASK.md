# High Lander Tech Test

## Software Engineer

# 1. Overview

This assessment aims to design and implement a web-based interactive navigation game as a complete, production-oriented system.

The assessment is divided into two phases:

1. Part 1 - Core System Implementation – delivering the base functionality of the game.
2. Part 2 - Extensions – adding scalability, deployment readiness, and multi-user competitive functionality.

# 2. Part 1 – Core System Implementation

## 2.1 Objective

Develop a production-ready, maintainable, and scalable web-based navigation game with real-time interaction and dynamic map-based gameplay.

## 2.2 Core Features

- Dynamic Player Marker – represents the current player’s real-time position on the map.
- Static Goal Marker – generated automatically at the start of the session, relative to the player’s current location, within a defined radius.
- Goal Detection – when the player is within the proximity threshold, trigger “goal reached” feedback.
- Shortest Path Display – upon game start, the system calculates and displays the shortest valid path from the player’s current position to the goal marker, using only permissible map routes.
  - Bonus: The path dynamically updates if the player’s position changes before reaching the goal.

## 2.3 Gameplay Requirements

- On game start (system going live), the goal location is generated relative to the player’s current position.
- The player’s position must be retrieved directly from the host machine on which the system is running, using its available location services or hardware sensors.
- The system calculates and displays the shortest valid path from the player’s position (ball marker) to the goal marker, using only permissible map routes.

## 2.4 Operational Requirements

- Runs locally on a development machine without additional cloud dependencies.
- Clear operational documentation for setup and execution. (Docker Compose)
- Architected, built, and prepared for scaling and production-level deployment, including performance, reliability, and maintainability considerations.

# 3. Part 2 - Extended System

## 3.1 Objective

Extend the base system to support multi-user competitive play and modern deployment practices.

## 3.2 Multi-User Competitive Mode

- Support multiple concurrent players in the same game session.
- Display all player markers on a shared map in real time.
- Implement logic to detect and declare the first player to reach the goal.
- Handle concurrency, synchronization, and conflict resolution effectively.

## 3.3 Containerization & CI/CD

- Package the system for deployment using containerization and orchestration (e.g., docker-compose).
- Implement a CI/CD pipeline to:
  - Build container images.
  - Run automated validation tests.
  - Deploy to a staging environment (local or remote).
- Provide documentation for a repeatable build, deploy, and test process.