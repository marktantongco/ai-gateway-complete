# 🤝 Contributing

## Welcome!

Thank you for considering contributing to Turnstile Solver! This document provides guidelines and information for contributors.

## 🎯 Ways to Contribute

| Type | Description | Difficulty |
|------|-------------|------------|
| 🐛 Bug Reports | Report issues | Easy |
| 📝 Documentation | Improve docs | Easy |
| 🧪 Testing | Test features | Medium |
| 💻 Code | Fix bugs/add features | Hard |

## 🐛 Bug Reports

### Before Reporting

1. Check existing issues
2. Try latest version
3. Reproduce the bug

### Issue Template

```markdown
## Bug Description
[Clear description of the bug]

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
[What you expected]

## Actual Behavior
[What actually happened]

## Environment
- OS: [e.g., Ubuntu 22.04]
- Docker: [e.g., 24.0.0]
- Solver Version: [e.g., 3.16]

## Logs
```
[Paste relevant logs]
```
```

## 💻 Development Setup

### Prerequisites

```bash
# Required
docker --version    # 20.10+
git --version       # 2.0+
python3 --version   # 3.10+

# Optional
pre-commit --version
```

### Clone and Setup

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/turnstile-solver.git
cd turnstile-solver

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Install pre-commit hooks
pre-commit install
```

### Project Structure

```
turnstile-solver/
├── docker/
│   ├── solver-light.Dockerfile
│   └── entrypoint-light.sh
├── turnstile_solver/
│   ├── __init__.py
│   ├── solver.py
│   └── utils.py
├── tests/
│   ├── test_solver.py
│   └── test_utils.py
├── docker-compose.override.yml
├── pyproject.toml
└── README.md
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
pytest

# With coverage
pytest --cov=turnstile_solver

# Verbose
pytest -v
```

### Test Locally

```bash
# Build Docker image
docker compose -f docker-compose.override.yml build

# Run container
docker compose -f docker-compose.override.yml up -d

# Test
curl -H "secret: turnstile123" http://localhost:8088/
```

## 📝 Code Style

### Python

- Follow PEP 8
- Use type hints
- Docstrings for all functions

```python
def solve_turnstile(site_url: str, site_key: str) -> dict:
    """
    Solve a Cloudflare Turnstile challenge.
    
    Args:
        site_url: URL of the page with Turnstile
        site_key: Turnstile site key
        
    Returns:
        dict with status and token
    """
    pass
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new proxy rotation algorithm
fix: handle timeout errors gracefully
docs: update installation guide
test: add unit tests for solver
```

## 🔄 Pull Request Process

### 1. Create Branch

```bash
git checkout -b feat/amazing-feature
```

### 2. Make Changes

- Write code
- Add tests
- Update docs

### 3. Test

```bash
pytest
docker compose build
```

### 4. Commit

```bash
git add .
git commit -m "feat: add amazing feature"
```

### 5. Push

```bash
git push origin feat/amazing-feature
```

### 6. Create PR

- Clear title and description
- Link related issues
- Request review

## 📋 PR Template

```markdown
## Description
[What this PR does]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring

## Testing
- [ ] Unit tests pass
- [ ] Docker builds
- [ ] Manual testing done

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes
```

## 🏷️ Labels

| Label | Description |
|-------|-------------|
| `bug` | Bug report |
| `enhancement` | New feature |
| `documentation` | Docs improvement |
| `good first issue` | Easy for newcomers |
| `help wanted` | Needs assistance |

## ❓ Questions?

- Open an issue with `question` label
- Check existing docs
- Review troubleshooting guide

## 📜 Code of Conduct

- Be respectful
- Welcome newcomers
- Constructive feedback
- No harassment

## 🔗 Links

- [GitHub Issues](https://github.com/marktantongco/turnstile-solver/issues)
- [Development Docs](../development/contributing.md)
