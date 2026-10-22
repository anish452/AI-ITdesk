import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../lib/auth';
import { LoginPage } from './LoginPage';

describe('sign-in screen', () => {
  it('shows the manufacturing desk and the demonstration accounts', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /multi-agent desk/i })).toBeInTheDocument();
    expect(screen.getByText('James Okonkwo')).toBeInTheDocument();
  });
});
