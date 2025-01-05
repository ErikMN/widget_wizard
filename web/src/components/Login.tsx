import React, { useState } from 'react';
import { serverGet } from '../helpers/cgihelper';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert
} from '@mui/material';
import { P1_CGI, buildUrl } from './constants';
import { useAuth } from './AuthContext';

const Login: React.FC = () => {
  const [ip, setIp] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setAuthData } = useAuth();

  const handleConnect = async () => {
    setError(null);
    setLoading(true);

    try {
      /* Make a GET request using jsonRequest */
      const response = await serverGet(buildUrl(ip, P1_CGI));

      // Check for 401 Unauthorized
      if (response.status === 401) {
        const authHeader = response.headers.get('www-authenticate');
        if (!authHeader) throw new Error('No WWW-Authenticate header found');

        /* Store credentials and token in AuthContext */
        setAuthData(ip, user, pass, authHeader);
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      } else {
        /* Store credentials with an empty token if no authentication is required */
        setAuthData(ip, user, pass, '');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Connection failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <Card sx={{ width: 360 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Connect to Device
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Device IP"
            variant="outlined"
            fullWidth
            margin="normal"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
          <TextField
            label="Username"
            variant="outlined"
            fullWidth
            margin="normal"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
          <TextField
            label="Password"
            variant="outlined"
            type="password"
            fullWidth
            margin="normal"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 2
            }}
          >
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={loading || !ip || !user || !pass}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
