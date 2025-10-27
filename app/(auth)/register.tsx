import { useState, useMemo } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import RegisterWizard from '../../components/auth/RegisterWizard';

export default function RegisterScreen() {
  const { sid } = useLocalSearchParams<{ sid?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { signUp } = useAuth();
  const router = useRouter();

  const hasSession = useMemo(() => typeof sid === 'string' && sid.length > 0, [sid]);

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { error, data } = await signUp(email, password, { first_name: firstName, last_name: lastName });
      setIsLoading(false);

      if (error) {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred during registration';
        Alert.alert('Registration Failed', errorMessage);
      } else {
        // Try to complete the registration session if we have one and a session is present
        if (hasSession) {
          try {
            await supabase.rpc('complete_registration_session', { p_session_id: sid as string });
          } catch {}
        }
        Alert.alert(
          'Registration Successful', 
          'Your account has been created. Please check your email to verify your account.',
          [{ text: 'OK', onPress: () => router.replace('/login') }]
        );
      }
    } catch (error) {
      setIsLoading(false);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      Alert.alert('Registration Failed', errorMessage);
    }
  };

  if (!hasSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Create an Account</Text>
        <Text style={{ textAlign: 'center', color: '#6c757d', marginBottom: 12 }}>You need a master key from the Admin to open registration.</Text>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/register-gate' } as any)} style={[styles.button, { backgroundColor: '#4e73df' }]}>
          <Text style={styles.buttonText}>Get Access With Master Key</Text>
        </TouchableOpacity>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.replace('/login')}>
            <Text style={styles.linkText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <RegisterWizard sid={typeof sid === 'string' ? sid : undefined} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  footer: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    marginRight: 4,
  },
  linkText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
