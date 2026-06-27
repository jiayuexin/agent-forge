import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge.js';

describe('StatusBadge', () => {
  it('renders online status', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText('在线')).toBeInTheDocument();
  });

  it('renders offline status', () => {
    render(<StatusBadge status="offline" />);
    expect(screen.getByText('离线')).toBeInTheDocument();
  });
});
