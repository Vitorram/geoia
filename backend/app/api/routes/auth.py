"""Rotas de cadastro e login."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.user import LoginRequest, RegisterRequest, TokenResponse, UserRead
from app.services.auth_service import (
    AuthenticationConfigurationError,
    AuthenticationStorageError,
    InvalidCredentialsError,
    login_user,
)
from app.services.user_service import (
    DuplicateEmailError,
    RegistrationStorageError,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Credenciais inválidas."},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Autenticação temporariamente indisponível."},
    },
)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        return login_user(db, request)
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except (AuthenticationStorageError, AuthenticationConfigurationError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível concluir a autenticação.",
        ) from None


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def register(request: RegisterRequest, db: Session = Depends(get_db)) -> UserRead:
    try:
        return register_user(db, request)
    except DuplicateEmailError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma conta com este e-mail.",
        ) from None
    except RegistrationStorageError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível concluir o cadastro.",
        ) from None
