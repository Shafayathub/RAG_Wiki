# Contributing to AI Research Assistant

Thank you for considering contributing to the AI Research Assistant project! We welcome contributions from the community to help improve this document research assistant with hybrid search and RAG capabilities.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Contributing Code](#contributing-code)
  - [Improving Documentation](#improving-documentation)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Community](#community)

## 🤝 Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

## 💡 How Can I Contribute?

### Reporting Bugs

Before submitting a bug report, please check if it has already been reported by searching the [Issues](../../issues).

When creating a bug report, please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Screenshots or screen recordings if applicable
- Environment details (OS, Node.js version, browser version)
- Any relevant logs or error messages

### Suggesting Features

Feature requests are welcome! Please check if your idea has already been suggested by searching the [Issues](../../issues).

When suggesting a feature, please include:

- A clear and descriptive title
- Detailed description of the feature and its benefits
- Use cases that would be enabled by this feature
- Any potential implementation considerations
- Mockups or examples if applicable

### Contributing Code

We welcome code contributions of all sizes! Whether it's fixing a typo, improving performance, or adding a new feature.

### Improving Documentation

Good documentation is crucial for any project. Contributions to improve the README, add tutorials, or enhance API documentation are greatly appreciated.

## 🔧 Development Setup

Follow these steps to set up the project for development:

1. **Fork the repository**
   - Click the "Fork" button on the top right of the repository page

2. **Clone your fork**

   ```bash
   git clone https://github.com/your-username/ai-research-assistant.git
   cd ai-research-assistant
   ```

3. **Install dependencies**

   ```bash
   pnpm install
   ```

4. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   - `POSTGRES_URL` - PostgreSQL connection string
   - `REDIS_URL` - Redis connection string
   - `OPENAI_API_KEY` - OpenAI API key
   - `PORT` - Server port (default: 5000)
   - `NODE_ENV` - Environment (development/production)

5. **Set up the database**

   ```bash
   pnpm migrate
   ```

6. **Start the development server**
   ```bash
   pnpm dev
   ```

   - Backend API will be available at `http://localhost:5000`
   - Frontend will be available at `http://localhost:5173`

## 📥 Pull Request Process

1. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**
   - Follow the coding standards outlined below
   - Write tests for new functionality
   - Update documentation as needed

3. **Test your changes**

   ```bash
   # Run linting
   pnpm lint

   # Run tests
   pnpm test

   # Start the app to manually test
   pnpm dev
   ```

4. **Commit your changes**

   ```bash
   git add .
   git commit -m "type: brief description of changes"
   ```

   Please follow the [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `style:` for formatting changes
   - `refactor:` for code refactoring
   - `test:` for adding/modifying tests
   - `chore:` for maintenance tasks

5. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Go to the original repository and click "New Pull Request"
   - Select your branch and provide a clear description of your changes
   - Reference any related issues in your PR description

## 📝 Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use explicit return types for exported functions
- Avoid `any` type when possible
- Use meaningful variable and function names
- Keep functions small and focused

### Code Formatting

- We use Prettier for code formatting
- Run `pnpm format` to automatically format code
- ESLint is configured to catch common issues
- Maximum line length: 100 characters

### Git Practices

- Write clear, descriptive commit messages
- Keep commits atomic and focused
- Rebase your branch before submitting a PR if needed
- Resolve merge conflicts promptly

## 🧪 Testing Guidelines

We aim for high test coverage to ensure reliability.

### Unit Tests

- Write unit tests for all new functions and classes
- Test edge cases and error conditions
- Use Jest as the testing framework
- Mock external dependencies (database, APIs, etc.)

### Integration Tests

- Test API endpoints with realistic data
- Test database interactions
- Test hybrid search functionality
- Test RAG pipeline with sample documents

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run linting
pnpm lint

# Run formatting check
pnpm format:check

# Fix formatting issues
pnpm format
```

## 📚 Documentation

- Keep README.md up to date with significant changes
- Add JSDoc comments for public APIs
- Update API documentation when endpoints change
- Add inline comments for complex logic
- Contribute to the wiki or examples directory if applicable

## 🐛 Bug Triage

When submitting a bug report, please use the following labels if applicable:

- `bug`: Confirmed bug
- `duplicate`: Issue is a duplicate of an existing one
- `good first issue`: Suitable for newcomers
- `help wanted`: Maintainers need help with this
- `invalid`: Not a valid issue
- `question`: Question rather than a bug or feature
- `wontfix`: Issue won't be fixed
- `enhancement`: Feature request

## 🏷️ Pull Request Labels

When reviewing PRs, maintainers may use these labels:

- `needs-review`: PR ready for review
- `changes-requested`: Author needs to make changes
- `approved`: Reviewer has approved the PR
- `merged`: PR has been merged
- `duplicate`: PR duplicates another one
- `wip`: Work in progress

## 🙌 Recognition

Contributors will be acknowledged in:

- Repository contributors list
- Release notes for significant contributions
- Project documentation (if applicable)
- Social media shoutouts (with permission)

## ❓ Need Help?

If you have questions during the contribution process:

- Check existing [issues](../../issues) and [discussions](../../discussions)
- Ask for clarification in issue comments
- Reach out to maintainers through GitHub

Thank you again for contributing to AI Research Assistant! Your help makes this project better for everyone.

---

_Last updated: June 2026_
